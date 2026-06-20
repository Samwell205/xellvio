import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const syncTwilioPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { runTwilioPricingSync } = await import("@/lib/twilio-pricing.server");
    return await runTwilioPricingSync();
  });

export const setDefaultMarkup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { percent: number }) =>
    z.object({ percent: z.number().min(0).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert(
        { key: "default_markup_percent", value: data.percent as any, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, percent: data.percent };
  });

export const getDefaultMarkup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data } = await context.supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "default_markup_percent")
      .maybeSingle();
    return { percent: Number((data?.value as any) ?? 50) };
  });
