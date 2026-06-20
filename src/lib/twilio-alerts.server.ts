// Urgent admin alert when master Twilio balance can't cover a campaign.
// Sends to 3 emails (via Lovable email queue) + 1 SMS (master Twilio).
// Throttled: at most one alert per 15-minute window per "kind".

const TWILIO_API = "https://api.twilio.com/2010-04-01";

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
  try {
    return n.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

async function loadSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", ["twilio_alert_emails", "twilio_alert_phone_e164", "twilio_alerts_enabled"]);
  const read = (k: string, f: any) => rows?.find((r) => r.key === k)?.value ?? f;
  const emailsRaw = String(read("twilio_alert_emails", "sam@samwellagency.com"));
  const emails = emailsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  const phone = String(read("twilio_alert_phone_e164", "+2348106199368"));
  const enabled = Boolean(read("twilio_alerts_enabled", true));
  return { emails, phone, enabled };
}

async function shouldSend(kind: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = `twilio_alert_last_${kind}_at`;
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const last = (data as any)?.value ? Date.parse(String((data as any).value)) : 0;
  return Date.now() - last > 15 * 60 * 1000;
}

async function markSent(kind: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = `twilio_alert_last_${kind}_at`;
  await supabaseAdmin
    .from("platform_settings")
    .upsert({ key, value: new Date().toISOString() as any }, { onConflict: "key" });
}

export async function fireCapacityAlert(args: AlertArgs): Promise<void> {
  try {
    if (!(await shouldSend(args.kind))) return;
    const settings = await loadSettings();
    if (!settings.enabled) return;

    const subject =
      args.kind === "mid_campaign_exhausted"
        ? `🚨 URGENT: Twilio ran dry mid-campaign — fund now`
        : `🚨 URGENT: Xellvio at capacity — Twilio needs funding`;

    const fmtMoney = (n: number) => fmt(n, args.currency);
    const lines = [
      `Master Twilio balance: ${fmtMoney(args.twilioBalance)}`,
      `Campaign cost: ${fmtMoney(args.campaignCost)}`,
      `Shortfall: ${fmtMoney(args.shortfall)}`,
      args.campaignName ? `Campaign: ${args.campaignName}` : null,
      args.tenantEmail ? `Tenant: ${args.tenantEmail}` : null,
      args.pausedCampaignCount != null
        ? `Total paused campaigns: ${args.pausedCampaignCount}`
        : null,
    ].filter(Boolean) as string[];

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#b91c1c;">${subject}</h1>
        <p style="margin:0 0 12px;line-height:1.5;">
          A tenant tried to send a campaign that exceeds your master Twilio balance.
          The campaign has been <strong>paused</strong> and will resume automatically as soon as Twilio is funded.
        </p>
        <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
          ${lines
            .map((l) => {
              const [k, ...rest] = l.split(":");
              return `<tr><td style="padding:4px 12px 4px 0;color:#666;">${k}</td><td style="padding:4px 0;font-weight:600;">${rest.join(":").trim()}</td></tr>`;
            })
            .join("")}
        </table>
        <p style="margin:16px 0;">
          <a href="https://console.twilio.com/us1/billing/manage-billing/recharge"
             style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
            Fund Twilio now
          </a>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#888;">Sent automatically by Xellvio.</p>
      </div>
    `;
    const text = `${subject}\n\n${lines.join("\n")}\n\nFund Twilio: https://console.twilio.com/us1/billing/manage-billing/recharge`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, "");

    // Enqueue one email per recipient
    await Promise.all(
      settings.emails.map((to) =>
        supabaseAdmin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to,
            subject,
            html,
            text,
            template_name: "twilio_capacity_alert",
            message_id: `twilio-capacity-${args.kind}-${stamp}-${to}`,
          } as any,
        }),
      ),
    );

    // Send SMS via master Twilio (best-effort)
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const msSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      if (sid && token && msSid && settings.phone) {
        const smsBody = `XELLVIO URGENT: Twilio ${fmtMoney(args.twilioBalance)} < campaign ${fmtMoney(args.campaignCost)}. Fund now to resume sends. https://console.twilio.com/us1/billing/manage-billing/recharge`;
        const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
        await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: auth,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: settings.phone,
            MessagingServiceSid: msSid,
            Body: smsBody.slice(0, 1500),
          }).toString(),
        });
      }
    } catch (e) {
      console.error("[twilio-alerts] SMS failed", e);
    }

    await markSent(args.kind);
  } catch (e) {
    console.error("[twilio-alerts] fireCapacityAlert error", e);
  }
}

// Fetch current master Twilio balance (uncached, lightweight)
export async function getMasterTwilioBalance(): Promise<{
  balance: number;
  currency: string;
  ok: boolean;
  error?: string;
}> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token)
    return { balance: 0, currency: "USD", ok: false, error: "no_credentials" };
  try {
    const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Balance.json`, {
      headers: { Authorization: auth },
    });
    if (!res.ok)
      return {
        balance: 0,
        currency: "USD",
        ok: false,
        error: `http_${res.status}`,
      };
    const json = (await res.json()) as { balance: string; currency: string };
    return { balance: Number(json.balance), currency: json.currency || "USD", ok: true };
  } catch (e: any) {
    return { balance: 0, currency: "USD", ok: false, error: String(e?.message ?? e) };
  }
}

export async function getBalanceBuffer(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "twilio_balance_buffer_usd")
    .maybeSingle();
  const v = Number((data as any)?.value ?? 5);
  return Number.isFinite(v) ? v : 5;
}
