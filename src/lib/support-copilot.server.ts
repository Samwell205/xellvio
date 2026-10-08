/** Builds a full account snapshot of one tenant for the admin support copilot. Server-only. */
export async function buildTenantSnapshot(accountId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as any;
  const [{ data: acct }, { data: camps }, { data: pays }, { data: reqs }, { data: nums }, { data: holds }] =
    await Promise.all([
      sb.from("accounts")
        .select("id, email, full_name, company, credit_balance, onboarding_status, sending_suspended_at, sending_suspended_reason, telnyx_phone_number, created_at")
        .eq("id", accountId).maybeSingle(),
      sb.from("campaigns").select("id, name, status, paused_reason, created_at, body")
        .eq("account_id", accountId).order("created_at", { ascending: false }).limit(10),
      sb.from("payments").select("provider, provider_reference, amount, currency, status, created_at, paid_at")
        .eq("account_id", accountId).order("created_at", { ascending: false }).limit(10),
      sb.from("number_requests").select("country, number_type, status, admin_notes, assigned_phone_number, area_code, created_at")
        .eq("account_id", accountId).order("created_at", { ascending: false }).limit(6),
      sb.from("numbers").select("phone_number, number_type, status").eq("account_id", accountId).limit(10),
      sb.from("tenant_sending_suspensions").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(5),
    ]);
  if (!acct) return "Tenant account not found.";

  const campIds = (camps ?? []).map((c: any) => c.id);
  const [{ data: fails }, { data: contacts }] = await Promise.all([
    campIds.length
      ? sb.from("messages").select("campaign_id, status, error_code, failure_reason")
          .in("campaign_id", campIds).in("status", ["failed", "undelivered"]).limit(3000)
      : Promise.resolve({ data: [] }),
    acct.email
      ? sb.from("contact_messages").select("topic, message, created_at").eq("email", acct.email)
          .order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const failBy: Record<string, Record<string, number>> = {};
  for (const m of (fails ?? []) as any[]) {
    const k = `${m.error_code ?? "?"}${m.failure_reason ? ` ${String(m.failure_reason).slice(0, 80)}` : ""}`;
    const b = (failBy[m.campaign_id] ??= {});
    b[k] = (b[k] ?? 0) + 1;
  }

  return [
    `Account id: ${acct.id}`,
    `Owner: ${acct.full_name ?? "?"} <${acct.email ?? "?"}> — company ${acct.company ?? "?"}, joined ${String(acct.created_at).slice(0, 10)}`,
    `Balance: $${Number(acct.credit_balance ?? 0).toFixed(2)}`,
    `Onboarding status: ${acct.onboarding_status ?? "?"}`,
    `Sending number on account: ${acct.telnyx_phone_number ?? "none"}`,
    acct.sending_suspended_at
      ? `SENDING ON HOLD since ${String(acct.sending_suspended_at).slice(0, 16)}: ${acct.sending_suspended_reason ?? "?"}`
      : "Sending: active (no hold)",
    "Hold history:",
    ...((holds ?? []) as any[]).map((h) => `- ${String(h.created_at).slice(0, 16)} ${h.reason ?? h.trigger ?? ""} ${h.lifted_at ? `(lifted ${String(h.lifted_at).slice(0, 10)})` : "(active)"}`),
    "Recent campaigns:",
    ...((camps ?? []) as any[]).map((c) => {
      const f = failBy[c.id];
      const fs = f ? ` | failures: ${Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${n}× ${k}`).join("; ")}` : "";
      return `- [${c.id}] "${c.name}" (${String(c.created_at).slice(0, 10)}) — ${c.status}${c.paused_reason ? ` (paused: ${c.paused_reason})` : ""}${fs}\n  text: ${String(c.body ?? "").slice(0, 200).replace(/\s+/g, " ")}`;
    }),
    "Payments:",
    ...((pays ?? []) as any[]).map((p) => `- ${String(p.created_at).slice(0, 10)} ${p.provider} ${p.amount} ${p.currency} — ${p.status}${p.provider_reference ? ` (ref ${p.provider_reference})` : ""}`),
    "Number requests:",
    ...((reqs ?? []) as any[]).map((r) => `- ${String(r.created_at).slice(0, 10)} ${r.country} ${r.number_type}${r.area_code ? ` area ${r.area_code}` : ""} — ${r.status}${r.assigned_phone_number ? ` → ${r.assigned_phone_number}` : ""}${r.admin_notes ? ` (note: ${String(r.admin_notes).slice(0, 150)})` : ""}`),
    "Numbers:",
    ...((nums ?? []) as any[]).map((n) => `- ${n.phone_number} ${n.number_type} ${n.status}`),
    "Recent contact-form messages from this tenant:",
    ...((contacts ?? []) as any[]).map((c) => `- ${String(c.created_at).slice(0, 10)} [${c.topic}] ${String(c.message).slice(0, 300)}`),
  ].join("\n");
}

export const COPILOT_PROMPT = `You are the internal support copilot for Xellvio, a bulk SMS platform. You help the platform owner (an admin) handle tenant support. The admin pastes a tenant's message; you investigate the tenant's account data provided below and produce the work a senior support engineer would.

Platform facts: 1 USD = 1 credit; card payments credit instantly; crypto needs ≥ $25 and credits after confirmation. Messages are charged per segment (160 GSM / 70 unicode). US sending needs a verified toll-free or 10DLC number; local verified numbers cost $100. Error meanings: 40001 landline; 30007/40002/40003/40010 carrier spam filtering (reword, name the business, no shorteners); 40008 destination route issue, NOT the tenant's fault and NOT fixed by registering a Danish sender; 40300/21610 opted out; 40310/21211/40011 bad number format; 40012/30003 unreachable; 30005/40013 number doesn't exist. "Sent" is not confirmed delivery; receipts can be delayed. Prohibited content includes prescription drugs (GLP-1, semaglutide, peptides, injections) unless licensed, phishing/impersonation of other brands (e.g. Coinbase, banks), gambling, loans/crypto scams.

Hard rules:
- Never promise or suggest refunds; refunds happen only if the owner decides. Never claim something was checked if it's not in the data.
- Never name internal providers or vendors (e.g. Telnyx, Twilio, Flutterwave, NOWPayments) in the customer reply.
- Never recommend lifting a sending hold when the hold was caused by prohibited, phishing or impersonation content.
- If data is missing to answer, say what to check.

Always answer in this exact structure:
## What's going on
Short plain-language diagnosis for the admin, citing the specific campaigns/payments/holds from the data.
## Reply to send
\`\`\`reply
A ready-to-send, friendly, professional email/chat reply to the tenant, signed "Xellvio Support".
\`\`\`
## Suggested fixes
Bullet list of things the admin should do. For one-click actions, add a line exactly like:
ACTION: resume_campaign <campaign uuid> | <short reason>
ACTION: lift_hold <account uuid> | <short reason>
Only suggest resume_campaign for campaigns in status paused or paused_by_user whose cause is resolved. Write "None" if nothing is needed.

If the admin asks a follow-up question, answer it directly and keep the same structure when a new reply is useful.`;
