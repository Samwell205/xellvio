import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

export const adminFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const [summaryRes, dailyRes, fundingRes] = await Promise.all([
      admin.rpc("admin_finance_summary"),
      admin.rpc("admin_finance_daily", { _days: 30 }),
      admin
        .from("payments")
        .select("id,account_id,provider,currency,amount,credits,status,created_at,paid_at,provider_reference")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (summaryRes.error) throw new Error(summaryRes.error.message);

    // Live carrier (provider) balance
    let providerBalance: { ok: boolean; balance: number; currency: string; error?: string } = {
      ok: false,
      balance: 0,
      currency: "USD",
    };
    try {
      const { getBalance } = await import("./telnyx.server");
      const b = await getBalance();
      providerBalance = { ok: !!b.ok, balance: Number(b.balance ?? 0), currency: b.currency || "USD", error: (b as any).error };
    } catch (e: any) {
      providerBalance = { ok: false, balance: 0, currency: "USD", error: e?.message ?? "balance unavailable" };
    }

    const { data: lastSnapshot } = await admin
      .from("twilio_balance_snapshots")
      .select("balance,currency,status,checked_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // label map for funding list
    const ids = Array.from(new Set((fundingRes.data ?? []).map((p: any) => p.account_id)));
    const labels = new Map<string, string>();
    if (ids.length) {
      const { data: accts } = await admin
        .from("accounts")
        .select("id,legal_business_name,company,full_name,email")
        .in("id", ids);
      for (const a of accts ?? [])
        labels.set(a.id, a.legal_business_name || a.company || a.full_name || a.email || a.id);
    }

    return {
      summary: summaryRes.data,
      daily: dailyRes.data ?? [],
      providerBalance,
      lastSnapshot: lastSnapshot ?? null,
      funding: (fundingRes.data ?? []).map((p: any) => ({ ...p, account_label: labels.get(p.account_id) ?? "—" })),
    };
  });

export const adminFinanceTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("admin_finance_tenants");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Per-tenant subsidy report: what each tenant was actually charged versus the
 * true carrier cost of their sends (base rate + carrier passthrough fee).
 * A negative margin means we sent their traffic at a loss.
 */
export const adminMarginAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("admin_margin_audit");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      account_id: string;
      label: string;
      email: string;
      messages: number;
      segments: number;
      mms_count: number;
      charged: number;
      true_cost: number;
      margin: number;
    }>;
  });

/**
 * Suggested sell prices derived from the true carrier cost of each country
 * (base rate + passthrough fee) at the given markup. Read-only preview — it
 * never writes to country_rates.
 */
export const adminPricingPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { markupPercent?: number }) => ({ markupPercent: Number(d?.markupPercent ?? 100) }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("country_rates")
      .select("country_code,country_name,cost_price,passthrough_fee,sell_price,markup_percent,mms_multiplier,active")
      .eq("active", true)
      .order("country_name");
    if (error) throw new Error(error.message);
    const markup = data.markupPercent;
    return (rows ?? []).map((r: any) => {
      const trueCost = Number(r.cost_price ?? 0) + Number(r.passthrough_fee ?? 0);
      const suggested = Math.round(trueCost * (1 + markup / 100) * 10000) / 10000;
      const current = Number(r.sell_price ?? 0);
      return {
        country_code: r.country_code,
        country_name: r.country_name,
        base_cost: Number(r.cost_price ?? 0),
        passthrough_fee: Number(r.passthrough_fee ?? 0),
        true_cost: +trueCost.toFixed(5),
        current_sell: current,
        current_margin: +(current - trueCost).toFixed(5),
        suggested_sell: suggested,
        suggested_mms_sell: +(suggested * Number(r.mms_multiplier ?? 5)).toFixed(4),
        below_cost: current < trueCost,
      };
    });
  });
