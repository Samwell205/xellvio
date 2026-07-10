import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reconciles message statuses for a campaign by polling Telnyx directly.
 * Useful when webhook DLRs are missed or delayed.
 */
export const reconcileCampaignMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns").select("id, account_id").eq("id", data.campaignId).maybeSingle();
    if (cErr || !campaign) throw new Error("Campaign not found");
    if (campaign.account_id !== userId) throw new Error("Forbidden");

    const nonTerminal = ["queued", "accepted", "sending", "sent", "receiving"];
    const stuck: Array<{ id: string; provider_message_id: string; status: string }> = [];
    const pageSize = 500;
    const maxChecked = 5_000;
    for (let from = 0; from < maxChecked; from += pageSize) {
      const { data: batch, error: batchErr } = await supabaseAdmin
        .from("messages")
        .select("id, provider_message_id, status")
        .eq("campaign_id", data.campaignId)
        .in("status", nonTerminal)
        .not("provider_message_id", "is", null)
        .filter("provider_message_id", "not.ilike", "SM%")
        .order("sent_at", { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1);
      if (batchErr) throw new Error(batchErr.message);
      const rows = (batch ?? []) as Array<{ id: string; provider_message_id: string; status: string }>;
      stuck.push(...rows);
      if (rows.length < pageSize) break;
    }
    if (stuck.length === 0) return { checked: 0, updated: 0, stillAwaiting: 0 };

    const { getMessage, mapTelnyxStatus } = await import("./telnyx.server");

    let updated = 0;
    let stillAwaiting = 0;
    let index = 0;
    const workers = Array.from({ length: Math.min(25, stuck.length) }, async () => {
      while (index < stuck.length) {
        const m = stuck[index++];
        try {
          const j = await getMessage(m.provider_message_id);
          const first = Array.isArray(j?.to) ? j.to[0] : null;
          const rawStatus = first?.status ?? j?.status ?? "";
          const errCode = first?.errors?.[0]?.code ?? j?.errors?.[0]?.code ?? null;
          const errDetail = first?.errors?.[0]?.detail ?? first?.errors?.[0]?.title ?? j?.errors?.[0]?.detail ?? j?.errors?.[0]?.title ?? null;
          let newStatus = mapTelnyxStatus(rawStatus);
          if (newStatus === "sent" && errCode) newStatus = "undelivered";
          if (!newStatus || newStatus === m.status) {
            if (newStatus === "sent") {
              stillAwaiting += 1;
              await supabaseAdmin.from("events").insert({
                message_id: m.id,
                type: "reconcile:checked:sent",
                payload: { provider_status: rawStatus || null },
              });
            }
            continue;
          }
          const update: any = { status: newStatus };
          if (newStatus === "delivered") update.delivered_at = new Date().toISOString();
          if (errCode) update.error_code = String(errCode);
          if (errDetail) update.failure_reason = String(errDetail).slice(0, 500);
          await supabaseAdmin.from("messages").update(update).eq("id", m.id);
          await supabaseAdmin.from("events").insert({
            message_id: m.id, type: `reconcile:${newStatus}`, payload: j,
          });
          updated += 1;
        } catch {
          /* ignore per-message failure */
        }
      }
    });
    await Promise.all(workers);
    return { checked: stuck.length, updated, stillAwaiting };
  });
