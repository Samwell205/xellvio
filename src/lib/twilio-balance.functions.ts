import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTwilioBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settingsRows } = await supabaseAdmin
      .from("platform_settings")
      .select("key,value")
      .in("key", [
        "twilio_low_balance_threshold_usd",
        "twilio_critical_balance_threshold_usd",
        "twilio_alert_email",
        "twilio_alert_emails",
        "twilio_alert_phone_e164",
        "twilio_alerts_enabled",
        "twilio_balance_buffer_usd",
      ]);
    const readS = (k: string, f: any) => settingsRows?.find((r) => r.key === k)?.value ?? f;

    const { data: latest } = await supabaseAdmin
      .from("twilio_balance_snapshots")
      .select("balance,currency,status,error_message,checked_at,alerted")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: pausedCampaignCount } = await supabaseAdmin
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("status", "paused_low_balance");

    return {
      latest,
      pausedCampaignCount: pausedCampaignCount ?? 0,
      settings: {
        threshold_low: Number(readS("twilio_low_balance_threshold_usd", 20)),
        threshold_critical: Number(readS("twilio_critical_balance_threshold_usd", 5)),
        alert_email: String(readS("twilio_alert_email", "")),
        alert_emails: String(readS("twilio_alert_emails", "")),
        alert_phone_e164: String(readS("twilio_alert_phone_e164", "")),
        alerts_enabled: Boolean(readS("twilio_alerts_enabled", true)),
        balance_buffer_usd: Number(readS("twilio_balance_buffer_usd", 5)),
      },
    };
  });

export const refreshTwilioBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { checkTwilioBalanceAndAlert } = await import("@/lib/twilio-balance.server");
    return await checkTwilioBalanceAndAlert();
  });

export const updateTwilioBalanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    threshold_low?: number;
    threshold_critical?: number;
    alert_email?: string;
    alert_emails?: string;
    alert_phone_e164?: string;
    alerts_enabled?: boolean;
    balance_buffer_usd?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows: Array<{ key: string; value: any }> = [];
    if (typeof data.threshold_low === "number")
      rows.push({ key: "twilio_low_balance_threshold_usd", value: data.threshold_low });
    if (typeof data.threshold_critical === "number")
      rows.push({ key: "twilio_critical_balance_threshold_usd", value: data.threshold_critical });
    if (typeof data.alert_email === "string")
      rows.push({ key: "twilio_alert_email", value: data.alert_email });
    if (typeof data.alert_emails === "string")
      rows.push({ key: "twilio_alert_emails", value: data.alert_emails });
    if (typeof data.alert_phone_e164 === "string")
      rows.push({ key: "twilio_alert_phone_e164", value: data.alert_phone_e164 });
    if (typeof data.alerts_enabled === "boolean")
      rows.push({ key: "twilio_alerts_enabled", value: data.alerts_enabled });
    if (typeof data.balance_buffer_usd === "number")
      rows.push({ key: "twilio_balance_buffer_usd", value: data.balance_buffer_usd });

    for (const r of rows) {
      await supabaseAdmin.from("platform_settings").upsert(r, { onConflict: "key" });
    }
    return { ok: true };
  });

export const resumePausedCampaignsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { resumePausedCampaigns } = await import("./twilio-resume.server");
    const ids = await resumePausedCampaigns();
    return { resumed: ids.length, ids };
  });

export const sendTestCapacityAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Clear throttle so test always fires
    await supabaseAdmin
      .from("platform_settings")
      .delete()
      .in("key", [
        "twilio_alert_last_campaign_paused_at",
        "twilio_alert_last_mid_campaign_exhausted_at",
        "twilio_alert_last_test_at",
      ]);

    // Read current recipients for the response
    const { data: rows } = await supabaseAdmin
      .from("platform_settings")
      .select("key,value")
      .in("key", ["twilio_alert_emails", "twilio_alert_phone_e164", "twilio_alerts_enabled"]);
    const read = (k: string, f: any) => rows?.find((r) => r.key === k)?.value ?? f;
    const emails = String(read("twilio_alert_emails", ""))
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    const phone = String(read("twilio_alert_phone_e164", ""));
    const enabled = Boolean(read("twilio_alerts_enabled", true));

    if (!enabled) throw new Error("Alerts are disabled — turn them on first.");

    const { fireCapacityAlert, getMasterTwilioBalance } = await import("./twilio-alerts.server");
    const bal = await getMasterTwilioBalance();
    await fireCapacityAlert({
      kind: "campaign_paused",
      campaignName: "[TEST] Xellvio alert verification",
      tenantEmail: context.claims?.email ?? null,
      twilioBalance: bal.balance,
      currency: bal.currency || "USD",
      campaignCost: bal.balance + 100,
      shortfall: 100,
      pausedCampaignCount: 0,
    });
    return { ok: true, emails, phone };
  });
