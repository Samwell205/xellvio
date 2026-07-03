// Compat shim for the old twilio-alerts module. Now Telnyx-backed.
// The dispatcher no longer imports this file (it was gutted), but the
// admin balance card's "Send test alert" still calls fireCapacityAlert
// so we keep a working implementation that sends via Telnyx.

export async function getMasterTwilioBalance(): Promise<{ balance: number; currency: string; ok: boolean; error?: string }> {
  const { getBalance } = await import("./telnyx.server");
  return getBalance();
}

export async function getBalanceBuffer(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings").select("value").eq("key", "twilio_balance_buffer_usd").maybeSingle();
  const v = Number((data as any)?.value ?? 5);
  return Number.isFinite(v) ? v : 5;
}

type AlertArgs = {
  kind: "campaign_paused" | "mid_campaign_exhausted";
  campaignId?: string;
  tenantEmail?: string | null;
  campaignName?: string | null;
  twilioBalance: number;
  currency: string;
  campaignCost: number;
  shortfall: number;
  pausedCampaignCount?: number;
};

function fmt(n: number, currency: string) {
  try { return n.toLocaleString("en-US", { style: "currency", currency }); }
  catch { return `$${n.toFixed(2)}`; }
}

async function loadSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("platform_settings").select("key,value")
    .in("key", ["telnyx_alert_emails", "telnyx_alert_phone_e164", "telnyx_alerts_enabled"]);
  const read = (k: string, f: any) => rows?.find((r) => r.key === k)?.value ?? f;
  const emailsRaw = String(read("telnyx_alert_emails", "admin@xellvio.com"));
  const emails = emailsRaw.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  const phone = String(read("telnyx_alert_phone_e164", "+2348106199368"));
  const enabled = Boolean(read("telnyx_alerts_enabled", true));
  return { emails, phone, enabled };
}

async function shouldSend(kind: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = `telnyx_alert_last_${kind}_at`;
  const { data } = await supabaseAdmin
    .from("platform_settings").select("value").eq("key", key).maybeSingle();
  const last = (data as any)?.value ? Date.parse(String((data as any).value)) : 0;
  return Date.now() - last > 15 * 60 * 1000;
}
async function markSent(kind: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("platform_settings").upsert(
    { key: `telnyx_alert_last_${kind}_at`, value: new Date().toISOString() as any },
    { onConflict: "key" },
  );
}

export async function fireCapacityAlert(args: AlertArgs): Promise<void> {
  try {
    if (!(await shouldSend(args.kind))) return;
    const settings = await loadSettings();
    if (!settings.enabled) return;
    const fmtMoney = (n: number) => fmt(n, args.currency);
    const subject = args.kind === "mid_campaign_exhausted"
      ? `URGENT: Telnyx ran dry mid-campaign — fund now`
      : `URGENT: Xellvio at capacity — Telnyx needs funding`;
    const lines = [
      `Telnyx balance: ${fmtMoney(args.twilioBalance)}`,
      `Campaign cost: ${fmtMoney(args.campaignCost)}`,
      `Shortfall: ${fmtMoney(args.shortfall)}`,
      args.campaignName ? `Campaign: ${args.campaignName}` : null,
      args.tenantEmail ? `Tenant: ${args.tenantEmail}` : null,
      args.pausedCampaignCount != null ? `Paused campaigns: ${args.pausedCampaignCount}` : null,
    ].filter(Boolean) as string[];
    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;"><h1 style="color:#b91c1c;">${subject}</h1><p>${lines.join("<br>")}</p><p><a href="https://portal.telnyx.com/#/app/billing/payments" style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Fund Telnyx now</a></p></div>`;
    const text = `${subject}\n\n${lines.join("\n")}\n\nFund: https://portal.telnyx.com/#/app/billing/payments`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, "");
    await Promise.all(settings.emails.map((to) =>
      supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to, subject, html, text,
          template_name: "telnyx_capacity_alert",
          message_id: `telnyx-capacity-${args.kind}-${stamp}-${to}`,
        } as any,
      }),
    ));
    try {
      if (settings.phone) {
        const { sendAdminSms } = await import("./admin-notify.server");
        await sendAdminSms(`XELLVIO URGENT: Telnyx ${fmtMoney(args.twilioBalance)} < campaign ${fmtMoney(args.campaignCost)}.`);
      }
    } catch (e) { console.error("[telnyx-alerts] SMS failed", e); }
    await markSent(args.kind);
  } catch (e) {
    console.error("[telnyx-alerts] fireCapacityAlert error", e);
  }
}
