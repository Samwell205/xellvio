import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}

async function fetchAllRows<T = any>(builder: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export const adminListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [campRes, accRes] = await Promise.all([
      supabaseAdmin
        .from("campaigns")
        .select("id,account_id,name,status,message_body,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("accounts").select("id,email,company,legal_business_name,full_name"),
    ]);
    if (campRes.error) throw new Error(campRes.error.message);
    if (accRes.error) throw new Error(accRes.error.message);

    const campaigns = campRes.data ?? [];
    const acctMap = new Map((accRes.data ?? []).map((a: any) => [a.id, a]));

    const campaignIds = campaigns.map((c: any) => c.id);
    if (campaignIds.length === 0) return [];

    // Aggregate stats per campaign in a single SQL query.
    const stats = new Map<string, { total: number; delivered: number; failed: number; sent: number; unconfirmed: number; queued: number; cost: number; carrier_cost: number; segments: number }>();
    for (const id of campaignIds) stats.set(id, { total: 0, delivered: 0, failed: 0, sent: 0, unconfirmed: 0, queued: 0, cost: 0, carrier_cost: 0, segments: 0 });

    const { data: statRows, error: statErr } = await supabaseAdmin.rpc("admin_campaign_stats");
    if (statErr) throw new Error(statErr.message);
    for (const r of (statRows ?? []) as any[]) {
      if (!stats.has(r.campaign_id)) continue;
      stats.set(r.campaign_id, {
        total: Number(r.total ?? 0),
        delivered: Number(r.delivered ?? 0),
        failed: Number(r.failed ?? 0),
        sent: Number(r.sent ?? 0),
        unconfirmed: Number(r.unconfirmed ?? 0),
        queued: Number(r.queued ?? 0),
        cost: Number(r.cost ?? 0),
        carrier_cost: Number(r.carrier_cost ?? 0),
        segments: Number(r.segments ?? 0),
      });
    }

    return campaigns.map((c: any) => {
      const a: any = acctMap.get(c.account_id);
      const s = stats.get(c.id)!;
      const finalized = s.delivered + s.failed + s.unconfirmed + s.sent;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        message_body: c.message_body,
        created_at: c.created_at,
        
        account_id: c.account_id,
        account_label: a ? (a.legal_business_name || a.company || a.email) : "—",
        account_email: a?.email ?? null,
        total: s.total,
        delivered: s.delivered,
        failed: s.failed,
        unconfirmed: s.unconfirmed,
        sent_awaiting: s.sent,
        queued: s.queued,
        segments: s.segments,
        cost: +s.cost.toFixed(4),
        carrier_cost: +s.carrier_cost.toFixed(4),
        margin: +(s.cost - s.carrier_cost).toFixed(4),
        delivery_rate: finalized > 0 ? +((s.delivered / finalized) * 100).toFixed(1) : 0,
      };
    });
  });

export const adminGetCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: campaign, error: cErr }, { data: rates }] = await Promise.all([
      supabaseAdmin
        .from("campaigns")
        .select("id,account_id,name,status,message_body,created_at")
        .eq("id", data.campaignId)
        .maybeSingle(),
      supabaseAdmin.from("country_rates").select("country_code,cost_price,sell_price"),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id,email,company,legal_business_name,full_name")
      .eq("id", (campaign as any).account_id)
      .maybeSingle();

    const rows = await fetchAllRows<any>(() =>
      supabaseAdmin
        .from("messages")
        .select("id,phone_e164,country_code,status,cost,segments_count,sender_kind,error_code,failure_reason,sent_at,delivered_at,created_at,provider_message_id")
        .eq("campaign_id", data.campaignId)
        .order("created_at", { ascending: true }),
    );

    const costByCc = new Map<string, number>((rates ?? []).map((r: any) => [r.country_code, Number(r.cost_price ?? 0)]));

    const totals = {
      total: rows.length,
      sent: 0,
      awaiting_delivery: 0,
      delivered: 0,
      delivery_unconfirmed: 0,
      failed: 0,
      queued: 0,
      cost: 0,
      carrier_cost: 0,
      segments: 0,
      delivery_rate: 0,
    };
    const byCC = new Map<string, { recipients: number; delivered: number; unconfirmed: number; failed: number; segments: number; cost: number; carrier_cost: number }>();
    const byKind = new Map<string, { used: number; delivered: number; failed: number }>();
    const timelineMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    const failures: any[] = [];

    for (const r of rows) {
      const cc = r.country_code ?? "??";
      const seg = Number(r.segments_count ?? 1);
      const carrier = (costByCc.get(cc) ?? 0) * seg;
      const cur = byCC.get(cc) ?? { recipients: 0, delivered: 0, unconfirmed: 0, failed: 0, segments: 0, cost: 0, carrier_cost: 0 };
      cur.recipients += 1;
      cur.segments += seg;
      cur.cost += Number(r.cost ?? 0);
      cur.carrier_cost += carrier;
      if (r.status === "delivered") cur.delivered += 1;
      if (r.status === "delivery_unconfirmed") cur.unconfirmed += 1;
      if (r.status === "failed" || r.status === "undelivered") cur.failed += 1;
      byCC.set(cc, cur);

      if (r.sender_kind) {
        const k = byKind.get(r.sender_kind) ?? { used: 0, delivered: 0, failed: 0 };
        k.used += 1;
        if (r.status === "delivered") k.delivered += 1;
        if (r.status === "failed" || r.status === "undelivered") k.failed += 1;
        byKind.set(r.sender_kind, k);
      }

      totals.cost += Number(r.cost ?? 0);
      totals.carrier_cost += carrier;
      totals.segments += seg;
      if (["sent", "delivered", "delivery_unconfirmed", "failed", "undelivered"].includes(r.status)) totals.sent += 1;
      if (r.status === "sent") totals.awaiting_delivery += 1;
      if (r.status === "delivered") totals.delivered += 1;
      if (r.status === "delivery_unconfirmed") totals.delivery_unconfirmed += 1;
      if (r.status === "failed" || r.status === "undelivered") totals.failed += 1;
      if (r.status === "queued" || r.status === "sending" || r.status === "pending") totals.queued += 1;

      const ts = r.sent_at ?? r.created_at;
      if (ts) {
        const hour = new Date(ts).toISOString().slice(0, 13) + ":00";
        const t = timelineMap.get(hour) ?? { sent: 0, delivered: 0, failed: 0 };
        if (r.status === "sent" || r.status === "delivered") t.sent += 1;
        if (r.status === "delivered") t.delivered += 1;
        if (r.status === "failed" || r.status === "undelivered") t.failed += 1;
        timelineMap.set(hour, t);
      }

      if ((r.status === "failed" || r.status === "undelivered") && failures.length < 500) {
        failures.push({
          phone_e164: r.phone_e164,
          country_code: r.country_code,
          error_code: r.error_code,
          failure_reason: r.failure_reason,
          created_at: r.created_at,
        });
      }
    }

    totals.cost = +totals.cost.toFixed(4);
    totals.carrier_cost = +totals.carrier_cost.toFixed(4);
    totals.delivery_rate = totals.sent > 0 ? +((totals.delivered / totals.sent) * 100).toFixed(1) : 0;

    const acct: any = account;
    return {
      campaign: {
        id: (campaign as any).id,
        name: (campaign as any).name,
        status: (campaign as any).status,
        created_at: (campaign as any).created_at,
        
        message_body: (campaign as any).message_body,
      },
      account: {
        id: acct?.id ?? null,
        label: acct ? (acct.legal_business_name || acct.company || acct.email) : "—",
        email: acct?.email ?? null,
      },
      totals: {
        ...totals,
        margin: +(totals.cost - totals.carrier_cost).toFixed(4),
      },
      byCountry: Array.from(byCC.entries())
        .map(([country_code, v]) => ({
          country_code,
          ...v,
          cost: +v.cost.toFixed(4),
          carrier_cost: +v.carrier_cost.toFixed(4),
          margin: +(v.cost - v.carrier_cost).toFixed(4),
        }))
        .sort((a, b) => b.recipients - a.recipients),
      bySenderKind: Array.from(byKind.entries())
        .map(([sender_kind, v]) => ({ sender_kind, ...v }))
        .sort((a, b) => b.used - a.used),
      timeline: Array.from(timelineMap.entries())
        .map(([hour, v]) => ({ hour, ...v }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
      failures,
    };
  });
