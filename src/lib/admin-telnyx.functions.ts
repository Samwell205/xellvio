import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: ok } = await context.supabase.rpc("has_role", { _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

/**
 * Aggregate Telnyx spend from our own `messages` table. This is the source
 * of truth for what we submitted to Telnyx, priced with `country_rates`.
 * Telnyx's balance = topups − sum(carrier_cost) over all messaging usage.
 */
export const getTelnyxSpendOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Snapshots trend (last 30d)
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: snapshots } = await supabaseAdmin
      .from("twilio_balance_snapshots")
      .select("balance,currency,status,checked_at,error_message")
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(500);

    // Country rates (cost_price = what Telnyx charges us per segment)
    const { data: rates } = await supabaseAdmin
      .from("country_rates")
      .select("country_code,cost_price,sell_price,mms_multiplier,mms_cost_multiplier");
    const costByCountry = new Map<string, number>();
    const mmsMultByCountry = new Map<string, number>();
    for (const r of rates ?? []) {
      costByCountry.set(r.country_code, Number(r.cost_price ?? 0));
      mmsMultByCountry.set(r.country_code, Number((r as any).mms_cost_multiplier ?? r.mms_multiplier ?? 3));
    }

    // Pull messages that were actually submitted to Telnyx in windows
    async function pullSince(iso: string) {
      const pageSize = 1000;
      let from = 0;
      const rows: Array<{ campaign_id: string; country_code: string | null; segments_count: number | null; cost: number | null; status: string; created_at: string; is_mms: boolean | null }> = [];
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("messages")
          .select("campaign_id,country_code,segments_count,cost,status,created_at,is_mms")
          .gte("created_at", iso)
          .in("status", ["sent", "delivered", "delivery_unconfirmed", "undelivered"])
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
        if (rows.length > 200_000) break;
      }
      return rows;
    }

    // Real Telnyx cost per message = cost_price × segments × (mms_cost_multiplier if MMS)
    function realCarrierCost(r: { country_code: string | null; segments_count: number | null; is_mms: boolean | null }) {
      const cc = r.country_code ?? "??";
      const segs = Number(r.segments_count ?? 1);
      const mmsMult = r.is_mms ? (mmsMultByCountry.get(cc) ?? 3) : 1;
      return (costByCountry.get(cc) ?? 0) * segs * mmsMult;
    }

    const now = Date.now();
    const iso24h = new Date(now - 24 * 3600 * 1000).toISOString();
    const iso7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const iso30d = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

    const rows30 = await pullSince(iso30d);

    function agg(rows: typeof rows30) {
      let telnyxCost = 0;
      let tenantSpend = 0;
      let segments = 0;
      let messages = 0;
      let mmsCount = 0;
      const byCountry = new Map<string, { messages: number; segments: number; telnyx_cost: number; tenant_spend: number; mms_count: number }>();
      for (const r of rows) {
        const segs = Number(r.segments_count ?? 1);
        const cc = r.country_code ?? "??";
        const tCost = realCarrierCost(r);
        const spend = Number(r.cost ?? 0);
        telnyxCost += tCost;
        tenantSpend += spend;
        segments += segs;
        messages += 1;
        if (r.is_mms) mmsCount += 1;
        const b = byCountry.get(cc) ?? { messages: 0, segments: 0, telnyx_cost: 0, tenant_spend: 0, mms_count: 0 };
        b.messages += 1;
        b.segments += segs;
        b.telnyx_cost += tCost;
        b.tenant_spend += spend;
        if (r.is_mms) b.mms_count += 1;
        byCountry.set(cc, b);
      }
      return {
        messages, segments, mms_count: mmsCount,
        telnyx_cost: Number(telnyxCost.toFixed(4)),
        tenant_spend: Number(tenantSpend.toFixed(4)),
        margin: Number((tenantSpend - telnyxCost).toFixed(4)),
        by_country: Array.from(byCountry.entries())
          .map(([country, v]) => ({ country, ...v, telnyx_cost: Number(v.telnyx_cost.toFixed(4)), tenant_spend: Number(v.tenant_spend.toFixed(4)) }))
          .sort((a, b) => b.telnyx_cost - a.telnyx_cost),
      };
    }

    const w30 = agg(rows30);
    const w7 = agg(rows30.filter((r) => r.created_at >= iso7d));
    const w24 = agg(rows30.filter((r) => r.created_at >= iso24h));

    // Daily buckets (last 14 days)
    const daily = new Map<string, { day: string; telnyx_cost: number; segments: number; messages: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      daily.set(d, { day: d, telnyx_cost: 0, segments: 0, messages: 0 });
    }
    for (const r of rows30) {
      const day = r.created_at.slice(0, 10);
      const b = daily.get(day);
      if (!b) continue;
      const segs = Number(r.segments_count ?? 1);
      b.messages += 1;
      b.segments += segs;
      b.telnyx_cost += realCarrierCost(r);
    }

    // Top campaigns by Telnyx cost (30d)
    const byCamp = new Map<string, { campaign_id: string; messages: number; segments: number; telnyx_cost: number; tenant_spend: number }>();
    for (const r of rows30) {
      const segs = Number(r.segments_count ?? 1);
      const tCost = realCarrierCost(r);
      const b = byCamp.get(r.campaign_id) ?? { campaign_id: r.campaign_id, messages: 0, segments: 0, telnyx_cost: 0, tenant_spend: 0 };
      b.messages += 1;
      b.segments += segs;
      b.telnyx_cost += tCost;
      b.tenant_spend += Number(r.cost ?? 0);
      byCamp.set(r.campaign_id, b);
    }
    const topCampaigns = Array.from(byCamp.values()).sort((a, b) => b.telnyx_cost - a.telnyx_cost).slice(0, 20);

    // Hydrate campaign metadata
    const campaignIds = topCampaigns.map((c) => c.campaign_id);
    let campaignMeta = new Map<string, { name: string; account_id: string; created_at: string }>();
    let acctMeta = new Map<string, { name: string; email: string }>();
    if (campaignIds.length) {
      const { data: camps } = await supabaseAdmin
        .from("campaigns").select("id,name,account_id,created_at").in("id", campaignIds);
      for (const c of camps ?? []) campaignMeta.set(c.id, { name: c.name ?? "Untitled", account_id: c.account_id, created_at: c.created_at });
      const acctIds = Array.from(new Set((camps ?? []).map((c) => c.account_id)));
      if (acctIds.length) {
        const { data: accts } = await supabaseAdmin
          .from("accounts").select("id,legal_business_name,contact_email,email").in("id", acctIds);
        for (const a of accts ?? []) acctMeta.set(a.id, {
          name: a.legal_business_name ?? a.contact_email ?? a.email ?? "—",
          email: a.contact_email ?? a.email ?? "",
        });
      }
    }
    const topCampaignsHydrated = topCampaigns.map((c) => {
      const meta = campaignMeta.get(c.campaign_id);
      const acct = meta ? acctMeta.get(meta.account_id) : undefined;
      return {
        ...c,
        telnyx_cost: Number(c.telnyx_cost.toFixed(4)),
        tenant_spend: Number(c.tenant_spend.toFixed(4)),
        margin: Number((c.tenant_spend - c.telnyx_cost).toFixed(4)),
        name: meta?.name ?? "Unknown",
        created_at: meta?.created_at ?? null,
        tenant_name: acct?.name ?? "—",
        tenant_email: acct?.email ?? "",
      };
    });

    // First balance snapshot inside window (approx starting balance)
    const firstSnap = snapshots?.[snapshots.length - 1] ?? null;
    const latestSnap = snapshots?.[0] ?? null;
    const impliedSpendFromSnapshots = firstSnap && latestSnap
      ? Number(firstSnap.balance) - Number(latestSnap.balance) : null;

    return {
      snapshots: snapshots ?? [],
      latest: latestSnap,
      first_in_window: firstSnap,
      implied_spend_from_snapshots: impliedSpendFromSnapshots,
      windows: { last_24h: w24, last_7d: w7, last_30d: w30 },
      daily: Array.from(daily.values()).map((d) => ({ ...d, telnyx_cost: Number(d.telnyx_cost.toFixed(4)) })),
      top_campaigns: topCampaignsHydrated,
    };
  });

/**
 * Fetch the live billing/transaction feed straight from Telnyx.
 * Uses /balance for the source-of-truth balance.
 */
export const getTelnyxLiveBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getBalance } = await import("./telnyx.server");
    const bal = await getBalance();
    return { ...bal, checked_at: new Date().toISOString() };
  });
