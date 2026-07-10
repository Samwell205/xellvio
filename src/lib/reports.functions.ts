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
    failed: number;
    queued: number;
    cost: number;
    delivery_rate: number; // 0..100
  };
  byCountry: Array<{
    country_code: string;
    recipients: number;
    delivered: number;
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
        .select("id,phone_e164,country_code,status,cost,segments_count,sender_kind,error_code,failure_reason,sent_at,delivered_at,created_at")
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
      failed: 0,
      queued: 0,
      cost: 0,
      delivery_rate: 0,
    };
    const byCC = new Map<string, { recipients: number; delivered: number; failed: number; cost: number }>();
    const byKind = new Map<string, { used: number; delivered: number; failed: number }>();
    const timelineMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    const failures: CampaignReport["failures"] = [];

    for (const r of rows) {
      const cc = r.country_code ?? "??";
      const cur = byCC.get(cc) ?? { recipients: 0, delivered: 0, failed: 0, cost: 0 };
      cur.recipients += 1;
      cur.cost += Number(r.cost ?? 0);
      if (r.status === "delivered") cur.delivered += 1;
      if (r.status === "failed" || r.status === "undelivered") cur.failed += 1;
      byCC.set(cc, cur);

      if (r.sender_kind) {
        const cur2 = byKind.get(r.sender_kind) ?? { used: 0, delivered: 0, failed: 0 };
        cur2.used += 1;
        if (r.status === "delivered") cur2.delivered += 1;
        if (r.status === "failed" || r.status === "undelivered") cur2.failed += 1;
        byKind.set(r.sender_kind, cur2);
      }

      totals.cost += Number(r.cost ?? 0);
      if (["sent", "delivered", "failed", "undelivered"].includes(r.status)) totals.sent += 1;
      if (r.status === "sent") totals.awaiting_delivery += 1;
      if (r.status === "delivered") totals.delivered += 1;
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
    totals.delivery_rate = totals.sent > 0 ? +((totals.delivered / totals.sent) * 100).toFixed(1) : 0;

    return {
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
    };
  });
