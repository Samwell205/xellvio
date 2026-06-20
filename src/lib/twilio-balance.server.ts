// Server-only helpers to check the master Twilio account balance,
// persist snapshots, and trigger admin email alerts on state transitions.

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

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function readSetting<T>(rows: Array<{ key: string; value: any }> | null, key: string, fallback: T): T {
  const row = rows?.find((r) => r.key === key);
  if (!row || row.value === null || row.value === undefined) return fallback;
  return row.value as T;
}

export async function checkTwilioBalanceAndAlert(): Promise<CheckResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Load thresholds & alert settings
  const { data: settingsRows } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", [
      "twilio_low_balance_threshold_usd",
      "twilio_critical_balance_threshold_usd",
      "twilio_alert_email",
      "twilio_alerts_enabled",
    ]);

  const thresholdLow = Number(readSetting(settingsRows, "twilio_low_balance_threshold_usd", 20));
  const thresholdCritical = Number(readSetting(settingsRows, "twilio_critical_balance_threshold_usd", 5));
  const alertEmail = String(readSetting(settingsRows, "twilio_alert_email", ADMIN_NOTIFY_EMAIL));
  const alertsEnabled = Boolean(readSetting(settingsRows, "twilio_alerts_enabled", true));

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const checkedAt = new Date().toISOString();

  if (!sid || !token) {
    const snap = {
      balance: 0,
      currency: "USD",
      status: "error" as const,
      error_message: "Twilio credentials not configured",
      alerted: false,
      checked_at: checkedAt,
    };
    await supabaseAdmin.from("twilio_balance_snapshots").insert(snap);
    return { ...snap, error: snap.error_message, threshold_low: thresholdLow, threshold_critical: thresholdCritical };
  }

  // Fetch balance
  let balance = 0;
  let currency = "USD";
  try {
    const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Balance.json`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio Balance API ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { balance: string; currency: string };
    balance = Number(json.balance);
    currency = json.currency || "USD";
  } catch (e: any) {
    const snap = {
      balance: 0,
      currency: "USD",
      status: "error" as const,
      error_message: String(e?.message ?? e).slice(0, 500),
      alerted: false,
      checked_at: checkedAt,
    };
    await supabaseAdmin.from("twilio_balance_snapshots").insert(snap);
    return { ...snap, error: snap.error_message, threshold_low: thresholdLow, threshold_critical: thresholdCritical };
  }

  // Derive status
  let status: CheckResult["status"];
  if (balance <= thresholdCritical) status = "critical";
  else if (balance <= thresholdLow) status = "low";
  else status = "healthy";

  // Throttle: only alert when status transitions away from healthy
  // (i.e. the previous snapshot was a different non-healthy status, or healthy).
  const { data: prevRow } = await supabaseAdmin
    .from("twilio_balance_snapshots")
    .select("status")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevStatus = prevRow?.status as CheckResult["status"] | undefined;
  const shouldAlert =
    alertsEnabled &&
    (status === "low" || status === "critical") &&
    status !== prevStatus;

  let alerted = false;
  if (shouldAlert) {
    try {
      await enqueueLowBalanceEmail({
        to: alertEmail,
        balance,
        currency,
        status,
        thresholdLow,
        thresholdCritical,
      });
      alerted = true;
    } catch (e) {
      console.error("[twilio-balance] failed to enqueue alert email", e);
    }
  }

  await supabaseAdmin.from("twilio_balance_snapshots").insert({
    balance,
    currency,
    status,
    alerted,
    checked_at: checkedAt,
  });

  return {
    balance,
    currency,
    status,
    threshold_low: thresholdLow,
    threshold_critical: thresholdCritical,
    alerted,
    checked_at: checkedAt,
  };
}

async function enqueueLowBalanceEmail(args: {
  to: string;
  balance: number;
  currency: string;
  status: "low" | "critical";
  thresholdLow: number;
  thresholdCritical: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: args.currency });

  const subject =
    args.status === "critical"
      ? `URGENT: Twilio balance critical — ${fmt(args.balance)}`
      : `Twilio balance low — ${fmt(args.balance)}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">${subject}</h1>
      <p style="margin: 0 0 16px; line-height: 1.5;">
        Your Xellvio (Twilio) account balance has dropped below your
        <strong>${args.status === "critical" ? "critical" : "low"}</strong> threshold.
      </p>
      <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">Current balance</td><td style="padding: 4px 0; font-weight: 600;">${fmt(args.balance)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">Low threshold</td><td style="padding: 4px 0;">${fmt(args.thresholdLow)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#666;">Critical threshold</td><td style="padding: 4px 0;">${fmt(args.thresholdCritical)}</td></tr>
      </table>
      <p style="margin: 16px 0; line-height: 1.5;">
        If you've enabled <strong>Auto-Recharge</strong> in your Twilio Console, Twilio should top up automatically. Otherwise, top up manually now to avoid SMS sending interruptions.
      </p>
      <p style="margin: 16px 0;">
        <a href="https://console.twilio.com/us1/billing/manage-billing/recharge" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600;">Top up Twilio</a>
      </p>
      <p style="margin: 16px 0 0; font-size: 12px; color: #888;">
        Sent automatically by Xellvio · You can adjust the threshold or turn alerts off in Admin → Billing.
      </p>
    </div>
  `;

  const text = `${subject}\n\nCurrent balance: ${fmt(args.balance)}\nLow threshold: ${fmt(args.thresholdLow)}\nCritical threshold: ${fmt(args.thresholdCritical)}\n\nTop up: https://console.twilio.com/us1/billing/manage-billing/recharge`;

  const payload = {
    to: args.to,
    subject,
    html,
    text,
    template_name: "twilio_low_balance_alert",
    message_id: `twilio-balance-${args.status}-${new Date().toISOString().slice(0, 13)}`,
  };

  await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: payload as any,
  });
}
