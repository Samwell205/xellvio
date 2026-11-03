import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SmartSendingSettingsSchema } from "./smart-sending";

export const getSmartSendingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveActingAccount } = await import("./acting-account.server");
    const acting = await resolveActingAccount(context.userId);
    const { data, error } = await context.supabase.from("accounts")
      .select("smart_sending_enabled,smart_sending_hours").eq("id", acting.accountId).single();
    if (error) throw error;
    return { enabled: data.smart_sending_enabled, hours: data.smart_sending_hours, canEdit: acting.isOwner || (acting.role !== "viewer" && acting.permissions.settings === true) };
  });

export const saveSmartSendingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SmartSendingSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { resolveActingAccount, assertPermission } = await import("./acting-account.server");
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "settings");
    if (!acting.isOwner && acting.role === "viewer") throw new Error("Read-only access");
    const { error } = await context.supabase.rpc("save_smart_sending_settings", { _account: acting.accountId, _enabled: data.enabled, _hours: data.hours });
    if (error) throw error;
    return { ok: true };
  });