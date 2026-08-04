import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignReport = {
  campaign: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    message_body: string;
  } | null;
  totals: {
    total: number;
    sent: number;
    awaiting_delivery: number;
    delivered: number;
    delivery_unconfirmed: number;
    failed: number;
    queued: number;
    cost: number;
    reserved_cost: number;
    delivery_rate: number; // 0..100
    mms_count: number;
    is_mms: boolean;
  };
  byCountry: Array<{
    country_code: string;
    recipients: number;
    delivered: number;
    unconfirmed: number;
    failed: number;
    cost: number;
  }>;

  bySenderKind: Array<{
    sender_kind: string;
    used: number;
    delivered: number;
    failed: number;
  }>;
  timeline: Array<{ hour: string; sent: number; delivered: number; failed: number }>;
  failures: Array<{
    phone_e164: string;
    country_code: string | null;
    error_code: string | null;
    failure_reason: string | null;
    created_at: string;
  }>;
  failureBreakdown: Array<{
    code: string;
    label: string;
    count: number;
    retryable: boolean;
  }>;
  clicks: {
    links: number;
    total_clicks: number;
    clicked_links: number;
    click_rate: number; // clicked links / links tracked, 0..100
  };
};

export const getCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campaignId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CampaignReport> => {
    const { supabase } = context;

    // Verify access via RLS by fetching campaign first.
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id,name,status,created_at,message_body,account_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");

    const rows: any[] = [];
    const pageSize = 1000;
    for (let from = 0; from < 50_000; from += pageSize) {
      const { data: batch, error: mErr } = await supabase
        .from("messages")
        .select("id,phone_e164,country_code,status,cost,segments_count,sender_kind,error_code,failure_reason,sent_at,delivered_at,created_at,is_mms")
        .eq("campaign_id", data.campaignId)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (mErr) throw new Error(mErr.message);
      rows.push(...(batch ?? []));
      if (!batch || batch.length < pageSize) break;
    }

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
      delivery_rate: 0,
      mms_count: 0,
      is_mms: false,
    };
    const byCC = new Map<string, { recipients: number; delivered: number; unconfirmed: number; failed: number; cost: number }>();
    const byKind = new Map<string, { used: number; delivered: number; failed: number }>();
    const timelineMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    const failures: CampaignReport["failures"] = [];
    const failureCounts = new Map<string, number>();

    // Recipients are only charged once the message reaches the carrier.
    const BILLED = new Set(["sent", "delivered", "delivery_unconfirmed", "undelivered"]);
    const PENDING = new Set(["queued", "sending", "pending"]);

    for (const r of rows) {
      const cc = r.country_code ?? "??";
      const billed = BILLED.has(r.status);
      const pending = PENDING.has(r.status);
      const cur = byCC.get(cc) ?? { recipients: 0, delivered: 0, unconfirmed: 0, failed: 0, cost: 0 };
      cur.recipients += 1;
      if (billed) cur.cost += Number(r.cost ?? 0);
      if (r.status === "delivered") cur.delivered += 1;
      if (r.status === "delivery_unconfirmed") cur.unconfirmed += 1;
      if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") cur.failed += 1;
      byCC.set(cc, cur);


      if (r.sender_kind) {
        const cur2 = byKind.get(r.sender_kind) ?? { used: 0, delivered: 0, failed: 0 };
        cur2.used += 1;
        if (r.status === "delivered") cur2.delivered += 1;
        if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") cur2.failed += 1;
        byKind.set(r.sender_kind, cur2);
      }

      if (billed) totals.cost += Number(r.cost ?? 0);
      if (pending) totals.reserved_cost += Number(r.cost ?? 0);
      if (r.is_mms) totals.mms_count += 1;
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
      if (r.status === "failed" || r.status === "undelivered" || r.status === "delivery_unconfirmed") {
        const code = r.status === "delivery_unconfirmed" ? "delivery_unconfirmed" : (r.error_code ?? "unknown");
        failureCounts.set(code, (failureCounts.get(code) ?? 0) + 1);
      }
    }

    totals.cost = +totals.cost.toFixed(4);
    totals.reserved_cost = +totals.reserved_cost.toFixed(4);
    totals.delivery_rate = totals.sent > 0 ? +((totals.delivered / totals.sent) * 100).toFixed(1) : 0;
    totals.is_mms = totals.mms_count > 0;
    // Link-click tracking (short links created for this campaign).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clickRows: Array<{ clicks: number | null }> = [];
    for (let from = 0; from < 60_000; from += 1000) {
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
    // With one shared shortlink each click is a distinct recipient; with
    // per-recipient links each clicked link is one recipient.
    const engaged = clickRows.length > 1 ? clickedLinks : totalClicks;
    const clicks = {
      links: clickRows.length,
      total_clicks: totalClicks,
      clicked_links: engaged,
      click_rate: totals.delivered > 0 ? +Math.min(100, (engaged / totals.delivered) * 100).toFixed(1) : 0,
    };


    return {
      clicks,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        created_at: campaign.created_at,
        message_body: campaign.message_body,
      },
      totals,
      byCountry: Array.from(byCC.entries())
        .map(([country_code, v]) => ({ country_code, ...v, cost: +v.cost.toFixed(4) }))
        .sort((a, b) => b.recipients - a.recipients),
      bySenderKind: Array.from(byKind.entries())
        .map(([sender_kind, v]) => ({ sender_kind, ...v }))
        .sort((a, b) => b.used - a.used),
      timeline: Array.from(timelineMap.entries())
        .map(([hour, v]) => ({ hour, ...v }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
      failures,
      failureBreakdown: Array.from(failureCounts.entries())
        .map(([code, count]) => ({
          code,
          count,
          label:
            code === "dispatch_timeout" ? "Dispatch interrupted — refunded" :
            code === "40001" ? "Landline or non-routable number" :
            code === "40012" ? "Invalid phone number" :
            code === "40008" ? "Recipient carrier rejected" :
            code === "insufficient_balance" ? "Not sent — insufficient credit" :
            code === "delivery_unconfirmed" ? "Delivery not confirmed by recipient carrier" :
            "Other send failure",
          retryable: code === "dispatch_timeout",
        }))
        .sort((a, b) => b.count - a.count),
    };
  });
