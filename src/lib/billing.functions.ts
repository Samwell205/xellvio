import { resolveBillingAccount } from "./billing-account.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Balance top-ups happen only through verified payment confirmations, never a direct client call.
export const saveAutoRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean; threshold: number; amount: number }) => {
    if (d.threshold < 0 || d.amount < 0) throw new Error("Values must be positive");
    return d;
  })
  .handler(async ({ data, context }) => {
    const acting = await resolveBillingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("accounts").update({
      auto_recharge_enabled: data.enabled,
      auto_recharge_threshold: data.threshold,
      auto_recharge_amount: data.amount,
    }).eq("id", acting.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
