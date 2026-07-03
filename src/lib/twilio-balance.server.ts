// Server-only Telnyx balance check + persistence + email alerts.

import { ADMIN_NOTIFY_EMAIL } from "./admin-notify.server";

type CheckResult = {
  balance: number;
  currency: string;
  status: "healthy" | "low" | "critical" | "error";
  threshold_low: number;
  threshold_critical: number;
  alerted: boolean;
  error?: string;
  checked_at: string;
};

function readSetting<T>(rows: Array<{ key: string; value: any }> | null, key: string, fallback: T): T {
  const row = rows?.find((r) => r.key === key);
  if (!row || row.value === null || row.value === undefined) return fallback;
  return row.value as T;
}

export async function checkTwilioBalanceAndAlert(): Promise<CheckResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settingsRows } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", [
      "twilio_low_balance_threshold_usd",
      "twilio_critical_balance_threshold_usd",
      "telnyx_alert_email",
      "telnyx_alerts_enabled",
    ]);

  const thresholdLow = Number(readSetting(settingsRows, "twilio_low_balance_threshold_usd", 20));
  const thresholdCritical = Number(readSetting(settingsRows, "twilio_critical_balance_threshold_usd", 5));
  const alertEmail = String(readSetting(settingsRows, "telnyx_alert_email", ADMIN_NOTIFY_EMAIL));
  const alertsEnabled = Boolean(readSetting(settingsRows, "telnyx_alerts_enabled", true));

  const checkedAt = new Date().toISOString();
  const { getBalance } = await import("./telnyx.server");
  const bal = await getBalance();

  if (!bal.ok) {
    const snap = {
      balance: 0,
      currency: "USD",
      status: "error" as const,
      error_message: bal.error ?? "Telnyx balance fetch failed",
      alerted: false,
      checked_at: checkedAt,
    };
    await supabaseAdmin.from("twilio_balance_snapshots").insert(snap);
    return { ...snap, error: snap.error_message, threshold_low: thresholdLow, threshold_critical: thresholdCritical };
  }

  let status: CheckResult["status"];
  if (bal.balance <= thresholdCritical) status = "critical";
  else if (bal.balance <= thresholdLow) status = "low";
  else status = "healthy";

  const { data: prevRow } = await supabaseAdmin
    .from("twilio_balance_snapshots")
    .select("status").order("checked_at", { ascending: false }).limit(1).maybeSingle();
  const prevStatus = prevRow?.status as CheckResult["status"] | undefined;
  const shouldAlert = alertsEnabled && (status === "low" || status === "critical") && status !== prevStatus;

  let alerted = false;
  if (shouldAlert) {
    try {
      await enqueueLowBalanceEmail({
        to: alertEmail,
        balance: bal.balance,
        currency: bal.currency,
        status: status as "low" | "critical",
        thresholdLow,
        thresholdCritical,
      });
      alerted = true;
    } catch (e) {
      console.error("[telnyx-balance] failed to enqueue alert email", e);
    }
  }

  await supabaseAdmin.from("twilio_balance_snapshots").insert({
    balance: bal.balance, currency: bal.currency, status, alerted, checked_at: checkedAt,
  });

  return { balance: bal.balance, currency: bal.currency, status, threshold_low: thresholdLow, threshold_critical: thresholdCritical, alerted, checked_at: checkedAt };
}

async function enqueueLowBalanceEmail(args: {
  to: string; balance: number; currency: string;
  status: "low" | "critical"; thresholdLow: number; thresholdCritical: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: args.currency });
  const subject = args.status === "critical"
    ? `URGENT: Telnyx balance critical — ${fmt(args.balance)}`
    : `Telnyx balance low — ${fmt(args.balance)}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      <h1 style="font-size:20px;margin:0 0 12px;">${subject}</h1>
      <p>Your Telnyx account balance has dropped below your <strong>${args.status}</strong> threshold.</p>
      <p>Current balance: <strong>${fmt(args.balance)}</strong> · Low: ${fmt(args.thresholdLow)} · Critical: ${fmt(args.thresholdCritical)}</p>
      <p><a href="https://portal.telnyx.com/#/app/billing/payments" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Top up Telnyx</a></p>
    </div>`;
  const text = `${subject}\n\nCurrent: ${fmt(args.balance)}\nLow: ${fmt(args.thresholdLow)}\nCritical: ${fmt(args.thresholdCritical)}\n\nTop up: https://portal.telnyx.com/#/app/billing/payments`;
  await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      to: args.to, subject, html, text,
      template_name: "telnyx_low_balance_alert",
      message_id: `telnyx-balance-${args.status}-${new Date().toISOString().slice(0, 13)}`,
    } as any,
  });
}
