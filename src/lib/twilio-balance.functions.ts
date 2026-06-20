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
        "twilio_alerts_enabled",
      ]);
    const readS = (k: string, f: any) => settingsRows?.find((r) => r.key === k)?.value ?? f;

    const { data: latest } = await supabaseAdmin
      .from("twilio_balance_snapshots")
      .select("balance,currency,status,error_message,checked_at,alerted")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      latest,
      settings: {
        threshold_low: Number(readS("twilio_low_balance_threshold_usd", 20)),
        threshold_critical: Number(readS("twilio_critical_balance_threshold_usd", 5)),
        alert_email: String(readS("twilio_alert_email", "")),
        alerts_enabled: Boolean(readS("twilio_alerts_enabled", true)),
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
    alerts_enabled?: boolean;
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
    if (typeof data.alerts_enabled === "boolean")
      rows.push({ key: "twilio_alerts_enabled", value: data.alerts_enabled });

    for (const r of rows) {
      await supabaseAdmin.from("platform_settings").upsert(r, { onConflict: "key" });
    }
    return { ok: true };
  });
