import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (roleError) throw new Error(roleError.message);
    if (isAdmin !== true) throw new Error("Forbidden: admin only");
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
    const stats = new Map<string, { total: number; delivered: number; failed: number; sent: number; unconfirmed: number; queued: number; cost: number; reserved: number; carrier_cost: number; segments: number; mms_count: number }>();
    for (const id of campaignIds) stats.set(id, { total: 0, delivered: 0, failed: 0, sent: 0, unconfirmed: 0, queued: 0, cost: 0, reserved: 0, carrier_cost: 0, segments: 0, mms_count: 0 });

    const { data: statRows, error: statErr } = await supabaseAdmin.rpc("admin_campaign_stats");
    if (statErr) throw new Error(statErr.message);
    for (const r of (statRows ?? []) as any[]) {
      if (!stats.has(r.campaign_id)) continue;
      stats.set(r.campaign_id, {
        total: Number(r.total ?? 0),
        delivered: Number(r.delivered ?? 0),
        failed: Number(r.failed ?? 0),
        sent: Number(r.sent ?? 0),
        unconfirmed: Number(r.delivery_unconfirmed ?? 0),
        queued: Number(r.queued ?? 0),
        // Only money that was actually debited from the tenant wallet.
        cost: Number(r.tenant_cost ?? 0),
        // Estimated cost of recipients that have not been dispatched yet.
        reserved: Number(r.reserved_cost ?? 0),
        carrier_cost: Number(r.telnyx_cost ?? 0),
        segments: Number(r.segments ?? 0),
        mms_count: Number(r.mms_count ?? 0),
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
        failed: s.failed + s.unconfirmed,
        unconfirmed: s.unconfirmed,
        sent_awaiting: s.sent,
        queued: s.queued,
        segments: s.segments,
        mms_count: s.mms_count,
        is_mms: s.mms_count > 0,
        cost: +s.cost.toFixed(4),
        reserved_cost: +s.reserved.toFixed(4),
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
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (roleError) throw new Error(roleError.message);
    if (isAdmin !== true) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: campaign, error: cErr }, { data: rates }] = await Promise.all([
      supabaseAdmin
        .from("campaigns")
        .select("id,account_id,name,status,message_body,created_at")
        .eq("id", data.campaignId)
        .maybeSingle(),
      supabaseAdmin.from("country_rates").select("country_code,cost_price,sell_price,mms_multiplier,mms_cost_multiplier,passthrough_fee"),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id,email,company,legal_business_name,full_name")
      .eq("id", (campaign as any).account_id)
      .maybeSingle();

    const fetchRows = async (table: "messages" | "message_send_attempts", select: string) => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error: pageError } = await supabaseAdmin
          .from(table)
          .select(select)
          .eq("campaign_id", data.campaignId)
          .order("created_at", { ascending: true })
          .range(from, from + 999);
        if (pageError) throw new Error(pageError.message);
        out.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
      return out;
    };
    const [rows, attemptRows] = await Promise.all([
      fetchRows("messages", "id,phone_e164,country_code,status,cost,segments_count,sender_kind,error_code,failure_reason,sent_at,delivered_at,created_at,provider_message_id,is_mms"),
      fetchRows("message_send_attempts", "attempt_number,authorization_source,tenant_charge,estimated_carrier_cost,provider_status,reserved_at,sent_at,finalized_at,created_at"),
    ]);

    // True carrier cost per segment = base rate + per-message carrier passthrough fee.
    const costByCc = new Map<string, number>((rates ?? []).map((r: any) => [r.country_code, Number(r.cost_price ?? 0) + Number(r.passthrough_fee ?? 0)]));
    const mmsMultByCc = new Map<string, number>((rates ?? []).map((r: any) => [r.country_code, Number(r.mms_cost_multiplier ?? r.mms_multiplier ?? 3)]));

    const totals = {
      total: rows.length,
      sent: 0,
      awaiting_delivery: 0,
      delivered: 0,
      delivery_unconfirmed: 0,
      failed: 0,
      queued: 0,
      cost: 0,
      reserved_cost: 0,
      carrier_cost: 0,
      segments: 0,
      delivery_rate: 0,
    };
    const byCC = new Map<string, { recipients: number; delivered: number; unconfirmed: number; failed: number; segments: number; cost: number; reserved_cost: number; carrier_cost: number; mms_count: number }>();
    // A recipient row only costs the tenant money once it has actually been handed
    // to the carrier. Rows still queued are an estimate, not a charge.
    const BILLED = new Set(["sent", "delivered", "delivery_unconfirmed", "undelivered"]);
    const PENDING = new Set(["queued", "sending", "pending"]);
    const byKind = new Map<string, { used: number; delivered: number; failed: number }>();
    const timelineMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    const failures: any[] = [];
    let mmsCount = 0;

    for (const r of rows) {
      const cc = r.country_code ?? "??";
      const seg = Number(r.segments_count ?? 1);
      const mmsMult = r.is_mms ? (mmsMultByCc.get(cc) ?? 3) : 1;
      const carrier = (costByCc.get(cc) ?? 0) * seg * mmsMult;
      const billed = BILLED.has(r.status);
      const pending = PENDING.has(r.status);
      const cur = byCC.get(cc) ?? { recipients: 0, delivered: 0, unconfirmed: 0, failed: 0, segments: 0, cost: 0, reserved_cost: 0, carrier_cost: 0, mms_count: 0 };
      cur.recipients += 1;
      cur.segments += seg;
      if (billed) cur.cost += Number(r.cost ?? 0);
      if (pending) cur.reserved_cost += Number(r.cost ?? 0);
      if (billed) cur.carrier_cost += carrier;
      if (r.is_mms) { cur.mms_count += 1; mmsCount += 1; }
      if (r.status === "delivered") cur.delivered += 1;
      if (r.status === "delivery_unconfirmed") cur.unconfirmed += 1;
      if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") cur.failed += 1;
      byCC.set(cc, cur);


      if (r.sender_kind) {
        const k = byKind.get(r.sender_kind) ?? { used: 0, delivered: 0, failed: 0 };
        k.used += 1;
        if (r.status === "delivered") k.delivered += 1;
        if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") k.failed += 1;
        byKind.set(r.sender_kind, k);
      }

      if (billed) totals.cost += Number(r.cost ?? 0);
      if (pending) totals.reserved_cost += Number(r.cost ?? 0);
      if (billed) totals.carrier_cost += carrier;
      totals.segments += seg;
      if (["sent", "delivered", "delivery_unconfirmed", "failed", "undelivered"].includes(r.status)) totals.sent += 1;
      if (r.status === "sent") totals.awaiting_delivery += 1;
      if (r.status === "delivered") totals.delivered += 1;
      if (r.status === "delivery_unconfirmed") totals.delivery_unconfirmed += 1;
      if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") totals.failed += 1;
      if (r.status === "queued" || r.status === "sending" || r.status === "pending") totals.queued += 1;

      const ts = r.sent_at ?? r.created_at;
      if (ts) {
        const hour = new Date(ts).toISOString().slice(0, 13) + ":00";
        const t = timelineMap.get(hour) ?? { sent: 0, delivered: 0, failed: 0 };
        if (r.status === "sent" || r.status === "delivered") t.sent += 1;
        if (r.status === "delivered") t.delivered += 1;
      if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") t.failed += 1;
        timelineMap.set(hour, t);
      }

      if ((r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") && failures.length < 500) {
        failures.push({
          phone_e164: r.phone_e164,
          country_code: r.country_code,
          error_code: r.error_code,
          failure_reason: r.status === "delivery_unconfirmed" ? "Delivery could not be confirmed by the recipient carrier." : r.failure_reason,
          created_at: r.created_at,
        });
      }
    }

    totals.cost = +totals.cost.toFixed(4);
    totals.reserved_cost = +totals.reserved_cost.toFixed(4);
    totals.carrier_cost = +totals.carrier_cost.toFixed(4);
    totals.delivery_rate = totals.sent > 0 ? +((totals.delivered / totals.sent) * 100).toFixed(1) : 0;

    const acct: any = account;
    const attemptAudit = attemptRows.reduce(
      (acc: any, row: any) => {
        const isRetry = Number(row.attempt_number ?? 1) > 1;
        acc.total += 1;
        acc.charged += Number(row.tenant_charge ?? 0);
        acc.carrier_cost += Number(row.estimated_carrier_cost ?? 0);
        if (isRetry) {
          acc.retries += 1;
          acc.retry_charged += Number(row.tenant_charge ?? 0);
          acc.retry_carrier_cost += Number(row.estimated_carrier_cost ?? 0);
        }
        return acc;
      },
      { total: 0, retries: 0, charged: 0, carrier_cost: 0, retry_charged: 0, retry_carrier_cost: 0 },
    );
    const clickRows: any[] = [];
    for (let from = 0; from < 20_000; from += 1000) {
      const { data: page } = await supabaseAdmin
        .from("link_clicks")
        .select("clicks")
        .eq("campaign_id", data.campaignId)
        .range(from, from + 999);
      clickRows.push(...((page ?? []) as any[]));
      if (!page || page.length < 1000) break;
    }
    const totalClicks = clickRows.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
    const clickedLinks = clickRows.filter((r) => Number(r.clicks ?? 0) > 0).length;

    return {
      clicks: {
        links: clickRows.length,
        total_clicks: totalClicks,
        clicked_links: clickedLinks,
        click_rate: clickRows.length > 0 ? +((clickedLinks / clickRows.length) * 100).toFixed(1) : 0,
      },
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
        mms_count: mmsCount,
        is_mms: mmsCount > 0,
        margin: +(totals.cost - totals.carrier_cost).toFixed(4),
      },
      byCountry: Array.from(byCC.entries())
        .map(([country_code, v]) => ({
          country_code,
          ...v,
          cost: +v.cost.toFixed(4),
          reserved_cost: +v.reserved_cost.toFixed(4),
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
      attemptAudit,
    };
  });
