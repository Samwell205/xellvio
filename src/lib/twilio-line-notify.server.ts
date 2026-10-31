import { tollfreeEmailFor } from "./twilio-line-notify-rules";

/** Emails the business once per toll-free status change (submitted, approved, rejected). */
export async function notifyLineStatus(accountId: string): Promise<void> {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data: line } = await db.from("tenant_twilio_lines").select("status,notified_status,phone_number,verification_sid,status_detail").eq("account_id", accountId).maybeSingle();
  if (!line) return;
  const template = tollfreeEmailFor(line.status, line.notified_status);
  if (!template) return;
  const { data: acct } = await db.from("accounts").select("email,contact_email,full_name,legal_business_name").eq("id", accountId).maybeSingle();
  const to = acct?.contact_email || acct?.email;
  if (!to) return;
  const { sendBrandedEmail } = await import("./email/send-internal.server");
  const result = await sendBrandedEmail({
    templateName: template,
    recipientEmail: to,
    idempotencyKey: `tfline-${accountId}-${line.status}-${line.verification_sid ?? "none"}`,
    includeUnsubscribe: false,
    templateData: {
      firstName: String(acct?.full_name ?? "").split(" ")[0] || "there",
      businessName: acct?.legal_business_name || "your business",
      phoneNumber: line.phone_number ?? "",
      reason: line.status_detail ?? undefined,
      dashboardUrl: line.status === "active" ? "https://www.xellvio.com/app/campaigns/new" : "https://www.xellvio.com/app/toll-free-verification",
    },
  });
  if (result.success) await db.from("tenant_twilio_lines").update({ notified_status: line.status }).eq("account_id", accountId);
  else console.error("[toll-free email]", result.reason);
}

/** Hourly: refresh pending verifications so approval/rejection is picked up without a page visit. */
export async function refreshPendingLines(limit = 50): Promise<{ checked: number }> {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data } = await db.from("tenant_twilio_lines").select("account_id").eq("status", "verification_pending").limit(limit);
  const { refreshLine } = await import("./twilio-lines.server");
  for (const row of data ?? []) {
    await refreshLine(row.account_id).catch((e) => console.error("[toll-free refresh]", e));
  }
  return { checked: data?.length ?? 0 };
}
