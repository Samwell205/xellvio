import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const addFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) => {
    if (!Number.isFinite(d.amount) || d.amount <= 0 || d.amount > 100000) {
      throw new Error("Amount must be between $0.01 and $100,000");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bal, error } = await supabaseAdmin.rpc("topup_account", {
      _account_id: context.userId,
      _amount: data.amount,
      _description: `Manual top-up via dashboard`,
    });
    if (error) throw new Error(error.message);
    return { amount: data.amount, balance_after: Number(bal) };
  });

export const saveAutoRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean; threshold: number; amount: number }) => {
    if (d.threshold < 0 || d.amount < 0) throw new Error("Values must be positive");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("accounts").update({
      auto_recharge_enabled: data.enabled,
      auto_recharge_threshold: data.threshold,
      auto_recharge_amount: data.amount,
    }).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
