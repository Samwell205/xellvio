import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withTimeoutOr } from "./server-timeout";

type RefreshInput = { refresh?: boolean } | undefined;
const refreshValidator = (d: RefreshInput) => ({ refresh: !!d?.refresh });

export const adminFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(refreshValidator)
  .handler(async ({ context, data: input }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cachedReport } = await import("./admin-report-cache.server");
    const admin = supabaseAdmin as any;

    // All-time totals scan the full message history: reuse a recent result.
    const heavyPromise = cachedReport(
      "finance_overview",
      async () => {
        const [summaryRes, dailyRes, attemptsRes] = await Promise.all([
          admin.rpc("admin_finance_summary"),
          admin.rpc("admin_finance_daily", { _days: 30 }),
          admin.rpc("admin_attempt_audit"),
        ]);
        if (summaryRes.error) throw new Error(summaryRes.error.message);
        return {
          summary: summaryRes.data,
          daily: dailyRes.data ?? [],
          attempts: attemptsRes.data ?? {},
        };
      },
      { refresh: input.refresh },
    );

    const fundingPromise = admin
      .from("payments")
      .select("id,account_id,provider,currency,amount,credits,status,created_at,paid_at,provider_reference")
      .order("created_at", { ascending: false })
      .limit(100);

    // Live carrier balance must never hold the page hostage.
    const balancePromise = withTimeoutOr(
      (async () => {
        const { getBalance } = await import("./telnyx.server");
        const b = await getBalance();
        return { ok: !!b.ok, balance: Number(b.balance ?? 0), currency: b.currency || "USD", error: (b as any).error as string | undefined };
      })(),
      { ok: false, balance: 0, currency: "USD", error: "balance unavailable right now" },
      6_000,
      "carrier balance",
    );

    const [heavy, fundingRes, providerBalance] = await Promise.all([heavyPromise, fundingPromise, balancePromise]);
    const summaryRes = { data: heavy.value.summary };
    const dailyRes = { data: heavy.value.daily };
    const attemptsRes = { data: heavy.value.attempts };

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

    const a = (attemptsRes.data ?? {}) as Record<string, unknown>;
    const attemptAudit = {
      total_attempts: Number(a.total_attempts ?? 0),
      retry_attempts: Number(a.retry_attempts ?? 0),
      tenant_charges: Number(a.tenant_charges ?? 0),
      carrier_cost: Number(a.carrier_cost ?? 0),
      retry_charges: Number(a.retry_charges ?? 0),
      retry_carrier_cost: Number(a.retry_carrier_cost ?? 0),
    };

    return {
      summary: summaryRes.data,
      daily: dailyRes.data ?? [],
      providerBalance,
      lastSnapshot: lastSnapshot ?? null,
      funding: (fundingRes.data ?? []).map((p: any) => ({ ...p, account_label: labels.get(p.account_id) ?? "—" })),
      attemptAudit,
    };
  });

export const adminFinanceTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!ok) throw new Error("Forbidden");
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
    const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!ok) throw new Error("Forbidden");
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
    const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!ok) throw new Error("Forbidden");
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
