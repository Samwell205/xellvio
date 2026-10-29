import { z } from "zod";
import { emailSenderDomain, renderEmail, renderEmailText, type EmailDraft } from "./email-campaign-rules";

export async function emailProviderRequest(path: string, init: RequestInit = {}) {
  const key = process.env["SENDGRID_API_KEY"];
  if (!key) throw new Error("Email delivery is not configured.");
  return fetch(`https://api.sendgrid.com/v3${path}`, { ...init, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers } });
}
export async function verifyCampaignSender(accountId: string, draft: EmailDraft) {
  z.string().email().parse(draft.from_email);
  if (draft.reply_to) z.string().email().parse(draft.reply_to);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: domain } = await db.from("email_sending_domains").select("id,provider_domain_id")
    .eq("account_id", accountId).eq("domain", emailSenderDomain(draft.from_email) ?? "").maybeSingle();
  if (!domain?.provider_domain_id) throw new Error("Connect and verify the domain used in your sender email before sending.");
  const { validateDomain } = await import("./email-domains.server");
  const result = await validateDomain(Number(domain.provider_domain_id));
  const { error } = await db.from("email_sending_domains").update({ status: result.valid ? "verified" : "pending", dns_records: result.records,
    last_checked_at: new Date().toISOString() }).eq("id", domain.id);
  if (error) throw error;
  if (!result.valid) throw new Error("Your sender domain is waiting for its verification records. You can save this draft meanwhile.");
}
export async function processEmailQueue() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await db.rpc("email_claim_batch");
  if (error) throw error;
  const campaignIds = [...new Set((rows ?? []).map((r) => r.campaign_id))];
  if (!campaignIds.length) { await db.rpc("email_arm_dispatch"); return { processed: 0 }; }
  const { data: campaigns, error: ce } = await db.from("email_campaigns").select("*").in("id", campaignIds);
  if (ce) throw ce;
  // Bounded batches; every recipient has its own immutable ID and delivery token.
  for (const r of rows ?? []) {
    const campaign = campaigns?.find((c) => c.id === r.campaign_id);
    if (!campaign) continue;
    const { data: eligible, error: ee } = await db.rpc("email_recipient_eligible", { _id: r.id });
    if (ee) throw ee;
    if (!eligible) { await db.from("email_recipients").update({ status: "suppressed", updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "sending"); continue; }
    const parsed = (await import("./email-campaign-rules")).emailDraftSchema.safeParse(campaign);
    if (!parsed.success) continue;
    const unsubscribe = `https://xellvio.com/api/public/email/unsubscribe/${r.token}`;
    try {
      const res = await emailProviderRequest("/mail/send", { method: "POST", body: JSON.stringify({
        personalizations: [{ to: [{ email: r.email }], custom_args: { xellvio_recipient_id: r.id },
          headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }],
        from: { email: campaign.from_email, name: campaign.from_name },
        ...(campaign.reply_to ? { reply_to: { email: campaign.reply_to } } : {}),
        subject: campaign.subject.replace(/\{\{\s*first_name\s*\}\}/g, r.first_name || "there"),
        content: [{ type: "text/plain", value: renderEmailText(parsed.data, unsubscribe, r.first_name ?? "") }, { type: "text/html", value: renderEmail(parsed.data, unsubscribe, r.first_name ?? "") }],
        tracking_settings: { click_tracking: { enable: true }, open_tracking: { enable: true } },
      }) });
      const now = new Date().toISOString();
      if (res.status === 202) {
        const { error: saved } = await db.from("email_recipients").update({ status: "accepted", provider_id: res.headers.get("x-message-id"), accepted_at: now, updated_at: now }).eq("id", r.id).eq("status", "sending");
        if (saved) throw saved;
      } else {
        console.error("Marketing email refused", res.status, await res.text());
        await db.from("email_recipients").update({ status: "failed", last_error: "Email service refused this submission. Contact support.", updated_at: now }).eq("id", r.id).eq("status", "sending");
        if ([401, 403, 429].includes(res.status)) {
          await db.from("email_campaigns").update({ status: "paused", last_error: "Email service unavailable or daily sending limit reached. Contact support before resuming." }).eq("id", r.campaign_id);
        }
      }
    } catch (e) {
      console.error("Marketing email outcome unknown", e);
      await db.from("email_recipients").update({ status: "unconfirmed", last_error: "Submission outcome unknown; not resent to avoid duplicates", updated_at: new Date().toISOString() }).eq("id", r.id).eq("status", "sending");
    }
  }
  await db.rpc("email_finish_campaigns");
  await db.rpc("email_arm_dispatch");
  await db.rpc("email_wake_dispatch");
  return { processed: rows?.length ?? 0 };
}