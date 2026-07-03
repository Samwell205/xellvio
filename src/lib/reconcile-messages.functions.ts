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
    const { data: stuck } = await supabaseAdmin
      .from("messages")
      .select("id, provider_message_id, status")
      .eq("campaign_id", data.campaignId)
      .in("status", nonTerminal)
      .not("provider_message_id", "is", null)
      .limit(500);
    if (!stuck || stuck.length === 0) return { checked: 0, updated: 0 };

    const { getMessage, mapTelnyxStatus } = await import("./telnyx.server");

    let updated = 0;
    await Promise.all(
      stuck.map(async (m: any) => {
        try {
          const j = await getMessage(m.provider_message_id);
          const first = Array.isArray(j?.to) ? j.to[0] : null;
          const rawStatus = first?.status ?? j?.status ?? "";
          const errCode = first?.errors?.[0]?.code ?? j?.errors?.[0]?.code ?? null;
          let newStatus = mapTelnyxStatus(rawStatus);
          if (newStatus === "sent" && errCode) newStatus = "undelivered";
          if (!newStatus || newStatus === m.status) return;
          const update: any = { status: newStatus };
          if (newStatus === "delivered") update.delivered_at = new Date().toISOString();
          if (errCode) update.error_code = String(errCode);
          await supabaseAdmin.from("messages").update(update).eq("id", m.id);
          await supabaseAdmin.from("events").insert({
            message_id: m.id, type: `reconcile:${newStatus}`, payload: j,
          });
          updated += 1;
        } catch {
          /* ignore per-message failure */
        }
      }),
    );
    return { checked: stuck.length, updated };
  });
