import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecipientRow = {
  phone_e164: string;
  country_code: string | null;
  status: string;
  error_code: string | null;
  failure_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
  replied: boolean;
  reply_count: number;
  clicks: number;
  first_click_at: string | null;
  last_click_at: string | null;
};

/**
 * Tenant-facing export: every recipient in a campaign with delivery status,
 * whether they replied (inbound SMS in this account for that phone AFTER send),
 * and link-click totals for their messages. No pricing.
 */
export const getCampaignRecipientsExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campaignId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: RecipientRow[]; campaign: { id: string; name: string; created_at: string } }> => {
    const { supabase } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id,name,created_at,account_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");

    // Pull all messages (paginated, RLS-scoped).
    const messages: any[] = [];
    const pageSize = 1000;
    for (let from = 0; from < 200_000; from += pageSize) {
      const { data: batch, error } = await supabase
        .from("messages")
        .select("id,phone_e164,country_code,status,error_code,failure_reason,sent_at,delivered_at,created_at")
        .eq("campaign_id", data.campaignId)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      messages.push(...(batch ?? []));
      if (!batch || batch.length < pageSize) break;
    }

    const messageIds = messages.map((m) => m.id);
    const phones = Array.from(new Set(messages.map((m) => m.phone_e164)));

    // Link clicks per message
    const clicksByMsg = new Map<string, { clicks: number; first: string | null; last: string | null }>();
    if (messageIds.length) {
      for (let i = 0; i < messageIds.length; i += 500) {
        const chunk = messageIds.slice(i, i + 500);
        const { data: rows } = await supabase
          .from("link_clicks")
          .select("message_id,clicks,first_click_at,last_click_at")
          .in("message_id", chunk);
        for (const r of rows ?? []) {
          const cur = clicksByMsg.get(r.message_id) ?? { clicks: 0, first: null as string | null, last: null as string | null };
          cur.clicks += Number(r.clicks ?? 0);
          if (r.first_click_at && (!cur.first || r.first_click_at < cur.first)) cur.first = r.first_click_at;
          if (r.last_click_at && (!cur.last || r.last_click_at > cur.last)) cur.last = r.last_click_at;
          clicksByMsg.set(r.message_id, cur);
        }
      }
    }

    // Reply counts per phone (inbound SMS in this account after campaign creation)
    const repliesByPhone = new Map<string, number>();
    if (phones.length) {
      for (let i = 0; i < phones.length; i += 500) {
        const chunk = phones.slice(i, i + 500);
        const { data: rows } = await supabase
          .from("sms_thread_messages")
          .select("phone_e164")
          .eq("account_id", (campaign as any).account_id)
          .eq("direction", "inbound")
          .gte("created_at", (campaign as any).created_at)
          .in("phone_e164", chunk);
        for (const r of rows ?? []) {
          repliesByPhone.set(r.phone_e164, (repliesByPhone.get(r.phone_e164) ?? 0) + 1);
        }
      }
    }

    const rows: RecipientRow[] = messages.map((m) => {
      const c = clicksByMsg.get(m.id);
      const rc = repliesByPhone.get(m.phone_e164) ?? 0;
      return {
        phone_e164: m.phone_e164,
        country_code: m.country_code,
        status: m.status,
        error_code: m.error_code,
        failure_reason: m.failure_reason,
        sent_at: m.sent_at,
        delivered_at: m.delivered_at,
        created_at: m.created_at,
        replied: rc > 0,
        reply_count: rc,
        clicks: c?.clicks ?? 0,
        first_click_at: c?.first ?? null,
        last_click_at: c?.last ?? null,
      };
    });

    return {
      rows,
      campaign: {
        id: (campaign as any).id,
        name: (campaign as any).name,
        created_at: (campaign as any).created_at,
      },
    };
  });
