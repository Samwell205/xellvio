import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { emailDraftSchema, bundleQuote, emailSenderDomain } from "./email-campaign-rules";

async function access(userId: string, billing = false) {
  const { resolveActingAccount, assertPermission } = await import("./acting-account.server");
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, billing ? "billing" : "campaigns");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return { accountId: acting.accountId, db };
}
export const emailSetup = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { accountId, db } = await access(context.userId);
  const [domains, lists, bundle, account, capacity] = await Promise.all([
    db.from("email_sending_domains").select("id,domain,status").eq("account_id", accountId),
    db.from("contact_lists").select("id,name").eq("account_id", accountId).order("name").limit(500),
    db.from("email_bundles").select("*").eq("account_id", accountId).maybeSingle(),
    db.from("accounts").select("company,legal_business_name,business_address,contact_email,email").eq("id", accountId).single(),
    db.from("email_provider_capacity").select("daily_limit").eq("id", true).maybeSingle(),
  ]);
  for (const r of [domains, lists, bundle, account, capacity]) if (r.error) throw r.error;
  return { domains: domains.data ?? [], lists: lists.data ?? [], bundle: bundle.data, account: account.data, dailyCapacity: capacity.data?.daily_limit ?? 100 };
});
export const listEmailCampaigns = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { accountId, db } = await access(context.userId);
  const { data, error } = await db.from("email_campaigns").select("id,name,subject,status,total,created_at,schedule_at,last_error").eq("account_id", accountId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error; return data ?? [];
});
// Delete draft/cancelled email campaigns owned by the caller's account. Sent,
// queued or sending campaigns are never touched — their records and reports
// must survive for billing and compliance.
export const deleteEmailCampaigns = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { data: owned, error } = await db.from("email_campaigns").select("id").eq("account_id", accountId).in("id", data.ids).in("status", ["draft", "cancelled"]);
  if (error) throw error;
  const ids = (owned ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { deleted: 0 };
  const { error: rErr } = await db.from("email_recipients").delete().in("campaign_id", ids);
  if (rErr) throw rErr;
  const { error: dErr } = await db.from("email_campaigns").delete().in("id", ids);
  if (dErr) throw dErr;
  return { deleted: ids.length };
});
export const getEmailCampaign = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { data: c, error } = await db.from("email_campaigns").select("*").eq("account_id", accountId).eq("id", data.id).single();
  if (error) throw error;
  const { data: report, error: re } = await db.rpc("email_campaign_report", { _id: c.id });
  if (re) throw re;
  const { data: failures } = await db.from("email_recipients").select("email,status,last_error").eq("campaign_id", c.id).in("status", ["failed", "bounced", "unconfirmed", "complaint"]).limit(30);
  return { campaign: c, report: report as Record<string, number>, failures: failures ?? [] };
});
export const saveEmailCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => emailDraftSchema.parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  if (data.list_id) {
    const { data: list } = await db.from("contact_lists").select("id").eq("account_id", accountId).eq("id", data.list_id).maybeSingle();
    if (!list) throw new Error("This audience no longer exists.");
  }
  const { data: existing, error: ee } = await db.from("email_campaigns").select("id,status").eq("id", data.id).eq("account_id", accountId).maybeSingle();
  if (ee) throw ee;
  if (existing && existing.status !== "draft") throw new Error("This campaign has already left drafts; it cannot be overwritten.");
  const result = existing ? await db.from("email_campaigns").update({ ...data, updated_at: new Date().toISOString() }).eq("id", data.id).eq("account_id", accountId).eq("status", "draft").select("id").single()
    : await db.from("email_campaigns").insert({ ...data, account_id: accountId }).select("id").single();
  if (result.error) throw result.error; return { id: data.id };
});
export const launchEmailCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), schedule: z.string().datetime().nullable(), confirmed: z.literal(true) }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { data: c, error } = await db.from("email_campaigns").select("*").eq("id", data.id).eq("account_id", accountId).single();
  if (error) throw error;
  if (data.schedule && new Date(data.schedule).getTime() < Date.now()) throw new Error("Choose a future send time.");
  const { verifyCampaignSender } = await import("./email-campaigns.server");
  await verifyCampaignSender(accountId, emailDraftSchema.parse(c));
  const { data: total, error: qe } = await db.rpc("email_queue_campaign", { _id: data.id, _account: accountId, _schedule: data.schedule ?? undefined });
  if (qe) throw new Error(qe.message);
  const { error: wakeError } = await db.rpc("email_arm_dispatch");
  if (wakeError) console.error("Email queue wake failed", wakeError);
  await db.rpc("email_wake_dispatch");
  return { total, queued: true };
});
export const changeEmailCampaignStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["paused", "queued", "cancelled"]) }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { data: c, error: readError } = await db.from("email_campaigns").select("*").eq("id", data.id).eq("account_id", accountId).single();
  if (readError) throw readError;
  if (data.status === "queued") {
    if (c.status !== "paused") throw new Error("Only a paused campaign can resume.");
    const { verifyCampaignSender } = await import("./email-campaigns.server");
    await verifyCampaignSender(accountId, emailDraftSchema.parse(c));
  }
  const { error } = await db.from("email_campaigns").update({ status: data.status, last_error: null, updated_at: new Date().toISOString() }).eq("account_id", accountId).eq("id", data.id).in("status", ["queued", "sending", "paused"]);
  if (error) throw error;
  await db.rpc("email_arm_dispatch");
  if (data.status === "queued") await db.rpc("email_wake_dispatch");
  return { ok: true };
});
export const purchaseEmailBundle = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ plan: z.enum(["standard", "pro"]), contacts: z.number().int().min(250).max(150000), confirmed: z.literal(true) }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId, true);
  const q = bundleQuote(data.plan, data.contacts);
  if (q.price === undefined) throw new Error("This bundle price is unavailable.");
  const { error } = await db.rpc("email_activate_bundle", { _account: accountId, _plan: data.plan, _contacts: q.contacts, _limit: q.emails ?? -1, _price: q.price });
  if (error) throw new Error(error.message); return { ok: true };
});
export const cancelEmailBundleRenewal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { accountId, db } = await access(context.userId, true);
  const { error } = await db.from("email_bundles").update({ renew: false }).eq("account_id", accountId);
  if (error) throw error; return { ok: true };
});
export const sendEmailTest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), email: z.string().email(), confirmed: z.literal(true) }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { data: c, error } = await db.from("email_campaigns").select("*").eq("id", data.id).eq("account_id", accountId).single();
  if (error) throw error;
  const { verifyCampaignSender, emailProviderRequest } = await import("./email-campaigns.server");
  const draft = emailDraftSchema.parse(c);
  await verifyCampaignSender(accountId, draft);
  if (!emailSenderDomain(draft.from_email)) throw new Error("Enter a valid sender email.");
  const { error: reserveError } = await db.rpc("email_reserve_test", { _account: accountId });
  if (reserveError) throw new Error(reserveError.message);
  const { renderEmail, renderEmailText } = await import("./email-campaign-rules");
  const res = await emailProviderRequest("/mail/send", { method: "POST", body: JSON.stringify({ personalizations: [{ to: [{ email: data.email }] }], from: { email: draft.from_email, name: draft.from_name }, subject: `[Test] ${draft.subject}`, content: [{ type: "text/plain", value: renderEmailText(draft, "https://xellvio.com", "Test") }, { type: "text/html", value: renderEmail(draft, "https://xellvio.com", "Test") }], tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } } }) });
  if (res.status !== 202) { console.error("Email test refused", res.status, await res.text()); throw new Error("Email test was refused. Check your sender domain or contact support."); }
  return { accepted: true };
});