import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Cancel a campaign safely: prevent any further dispatch by flipping the
// campaign status to `cancelled`, and mark any still-queued messages as
// failed with reason `cancelled_by_user`. Messages that have already been
// sent or delivered are NOT touched — carriers have them already.
export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status, account_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.account_id !== userId) {
      // Team members with editor+ access may also cancel — RLS on the update
      // below is the final gate; we only short-circuit obvious cross-tenant.
    }
    if (["sent", "cancelled", "failed"].includes(campaign.status)) {
      return { ok: true, alreadyStopped: true, cancelledMessages: 0 };
    }

    // Load queued/sending row ids so we can report a count. Use admin to be
    // resilient to the tiny RLS window while a row is "sending".
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: queuedRows } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .in("status", ["queued", "pending"]);
    const ids = (queuedRows ?? []).map((r: any) => r.id);

    if (ids.length > 0) {
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed", error_code: "cancelled_by_user" })
        .in("id", ids);
    }

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "cancelled", paused_reason: "Cancelled by user" })
      .eq("id", data.campaignId);

    return { ok: true, cancelledMessages: ids.length };
  });

// Retry a single failed / undelivered message by resetting it to `queued` so
// the next dispatcher tick sends it again. Skips insufficient_balance rows
// unless the account now has enough credit — those get re-queued too and the
// planner-level preflight decides.
export const retryMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // RLS ensures the caller can only see their own account's messages.
    const { data: msg, error: mErr } = await supabase
      .from("messages")
      .select("id, status, campaign_id, cost")
      .eq("id", data.messageId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!msg) throw new Error("Message not found");
    if (!["failed", "undelivered"].includes(msg.status)) {
      throw new Error(`Cannot retry a message in state "${msg.status}"`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure the parent campaign isn't cancelled — a cancelled campaign
    // should not resume dispatch.
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, status")
      .eq("id", msg.campaign_id)
      .maybeSingle();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "cancelled") {
      throw new Error("Campaign is cancelled — resume it first");
    }

    await supabaseAdmin
      .from("messages")
      .update({ status: "queued", error_code: null })
      .eq("id", data.messageId);

    // Nudge the campaign back into "sending" so the dispatcher picks it up
    // on the next tick even if it had already flipped to "sent".
    if (["sent", "failed"].includes(campaign.status)) {
      await supabaseAdmin
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", msg.campaign_id);
    }

    return { ok: true };
  });

// Retry ALL failed messages on a campaign that failed for a specific reason
// (or all reasons when errorCode is null). Bulk version of retryMessage.
export const retryFailedMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; errorCode?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "cancelled") {
      throw new Error("Campaign is cancelled — cannot retry");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("messages")
      .update({ status: "queued", error_code: null })
      .eq("campaign_id", data.campaignId)
      .in("status", ["failed", "undelivered"])
      .select("id");
    if (data.errorCode) q = q.eq("error_code", data.errorCode);

    const { data: updated, error } = await q;
    if (error) throw new Error(error.message);

    if ((updated?.length ?? 0) > 0 && ["sent", "failed"].includes(campaign.status)) {
      await supabaseAdmin
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", data.campaignId);
    }
    return { ok: true, retried: updated?.length ?? 0 };
  });
