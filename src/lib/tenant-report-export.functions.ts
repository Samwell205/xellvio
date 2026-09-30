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

const FILTERS = ["delivered", "failed", "not_delivered", "sent_awaiting", "clicked", "replied", "all"] as const;

async function inChunks<T>(items: T[], size: number, run: (chunk: T[]) => Promise<void>) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  // Max 5 concurrent requests per invocation.
  for (let i = 0; i < chunks.length; i += 5) {
    await Promise.all(chunks.slice(i, i + 5).map(run));
  }
}

/**
 * Tenant-facing export, one page at a time so large campaigns never time out.
 * The browser calls this repeatedly with increasing `offset` until `done`.
 */
export const getCampaignRecipientsExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        filter: z.enum(FILTERS).default("all"),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{
    rows: RecipientRow[];
    nextOffset: number;
    done: boolean;
    campaign: { id: string; name: string; created_at: string };
  }> => {
    const { supabase } = context;
    const pageSize = 1000;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id,name,created_at,account_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    const c = campaign as any;

    let q = supabase
      .from("messages")
      .select("id,phone_e164,country_code,status,error_code,failure_reason,sent_at,delivered_at,created_at")
      .eq("campaign_id", data.campaignId);
    if (data.filter === "delivered") q = q.eq("status", "delivered");
    else if (data.filter === "failed") q = q.in("status", ["failed", "undelivered", "delivery_unconfirmed"]);
    else if (data.filter === "not_delivered") q = q.eq("status", "delivery_unconfirmed");
    else if (data.filter === "sent_awaiting") q = q.eq("status", "sent");

    const { data: batch, error } = await q
      .order("id", { ascending: true })
      .range(data.offset, data.offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const messages = (batch ?? []) as any[];

    // Every export writes clicks and replies columns, so always look them up.
    const needClicks = true;
    const needReplies = true;

    const clicksByMsg = new Map<string, { clicks: number; first: string | null; last: string | null }>();
    if (needClicks && messages.length) {
      await inChunks(messages.map((m) => m.id), 200, async (chunk) => {
        const { data: rows } = await supabase
          .from("link_clicks")
          .select("message_id,clicks,first_click_at,last_click_at")
          .in("message_id", chunk);
        for (const r of rows ?? []) {
          if (!r.message_id) continue;
          const cur = clicksByMsg.get(r.message_id) ?? { clicks: 0, first: null, last: null };
          cur.clicks += Number(r.clicks ?? 0);
          if (r.first_click_at && (!cur.first || r.first_click_at < cur.first)) cur.first = r.first_click_at;
          if (r.last_click_at && (!cur.last || r.last_click_at > cur.last)) cur.last = r.last_click_at;
          clicksByMsg.set(r.message_id, cur);
        }
      });
    }

    const repliesByPhone = new Map<string, number>();
    if (needReplies && messages.length) {
      const phones = Array.from(new Set(messages.map((m) => m.phone_e164)));
      await inChunks(phones, 150, async (chunk) => {
        const { data: rows } = await supabase
          .from("sms_thread_messages")
          .select("phone_e164")
          .eq("account_id", c.account_id)
          .eq("direction", "inbound")
          .gte("created_at", c.created_at)
          .in("phone_e164", chunk);
        for (const r of rows ?? []) {
          repliesByPhone.set(r.phone_e164, (repliesByPhone.get(r.phone_e164) ?? 0) + 1);
        }
      });
    }

    let rows: RecipientRow[] = messages.map((m) => {
      const ck = clicksByMsg.get(m.id);
      const rc = repliesByPhone.get(m.phone_e164) ?? 0;
      return {
        phone_e164: m.phone_e164,
        country_code: m.country_code,
        status: m.status === "delivery_unconfirmed" ? "failed" : m.status,
        error_code: m.error_code,
        failure_reason:
          m.status === "delivery_unconfirmed"
            ? "Delivery could not be confirmed by the recipient carrier."
            : m.failure_reason,
        sent_at: m.sent_at,
        delivered_at: m.delivered_at,
        created_at: m.created_at,
        replied: rc > 0,
        reply_count: rc,
        clicks: ck?.clicks ?? 0,
        first_click_at: ck?.first ?? null,
        last_click_at: ck?.last ?? null,
      };
    });
    if (data.filter === "clicked") rows = rows.filter((r) => r.clicks > 0);
    if (data.filter === "replied") rows = rows.filter((r) => r.reply_count > 0);

    return {
      rows,
      nextOffset: data.offset + messages.length,
      done: messages.length < pageSize,
      campaign: { id: c.id, name: c.name, created_at: c.created_at },
    };
  });
