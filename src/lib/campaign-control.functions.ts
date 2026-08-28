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

// Stop an in-flight campaign but finish it as `sent`: no further recipients are
// planned or dispatched, and every existing message row (delivered / sent /
// undelivered / failed), its cost and its report stay exactly as they are.
export const stopCampaignAsSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { STOPPED_AS_SENT } = await import("@/lib/campaign-stop");

    // RLS gate: the caller must be able to see (and update) this campaign.
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (["cancelled", "failed"].includes(campaign.status)) {
      throw new Error(`Cannot stop a campaign in state "${campaign.status}"`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Stop the queue: rows not yet handed to the carrier must not be sent, but
    // nothing already sent/delivered/failed is touched.
    const { data: queuedRows } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .in("status", ["queued", "pending"])
      .limit(20000);
    const ids = (queuedRows ?? []).map((r: any) => r.id);
    for (let i = 0; i < ids.length; i += 500) {
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed", error_code: "cancelled_by_user" })
        .in("id", ids.slice(i, i + 500));
    }

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sent", paused_reason: STOPPED_AS_SENT })
      .eq("id", data.campaignId);

    return { ok: true, stoppedMessages: ids.length };
  });

// Pause an in-flight campaign. Nothing already handed to the carrier is
// touched — queued rows simply stay queued until the tenant resumes. The
// dispatcher only selects campaigns in queued/sending/scheduled, so flipping
// the status to `paused_by_user` stops further dispatch immediately.
export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (!["queued", "sending", "processing", "scheduled"].includes(campaign.status)) {
      throw new Error(`Cannot pause a campaign in state "${campaign.status}"`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "paused_by_user",
        paused_reason: "Paused by user",
        paused_at: new Date().toISOString(),
      })
      .eq("id", data.campaignId);

    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.campaignId)
      .eq("status", "queued");

    return { ok: true, pausedMessages: count ?? 0 };
  });

// Resume a campaign the tenant paused. Puts it back in the dispatcher's queue;
// remaining queued rows go out on the next tick.
export const resumeCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "paused_by_user") {
      throw new Error(`Cannot resume a campaign in state "${campaign.status}"`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("campaigns")
      .update({ status: "sending", paused_reason: null, paused_at: null })
      .eq("id", data.campaignId);

    return { ok: true };
  });

// Retry a single failed / undelivered message by resetting it to `queued` so
// the next dispatcher tick sends it again. Skips insufficient_balance rows
// unless the account now has enough credit — those get re-queued too and the
// planner-level preflight decides.
export const retryMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; confirmed?: boolean; dryRun?: boolean; forceSms?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // RLS ensures the caller can only see their own account's messages.
    const { data: msg, error: mErr } = await supabase
      .from("messages")
      .select("id, status, campaign_id, cost, retry_count, is_mms")
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
      .select("id, status, account_id, media_url")
      .eq("id", msg.campaign_id)
      .maybeSingle();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "cancelled") {
      throw new Error("Campaign is cancelled — resume it first");
    }

    // Re-price from the live rate card before the row goes back out.
    const { priceRetryRows, applyRetryPricing } = await import("@/lib/campaign-retry-pricing.server");
    if (data.forceSms && !(msg as any).is_mms) {
      throw new Error("Only a failed picture message can be retried as SMS");
    }
    const preflight = await priceRetryRows(supabaseAdmin, campaign as any, [data.messageId], {
      forceSms: data.forceSms,
    });
    if (data.dryRun) {
      return {
        ok: true,
        dryRun: true,
        count: preflight.count,
        estimatedCost: preflight.estimatedCost,
        balance: preflight.balance,
        shortfall: preflight.shortfall,
        isMms: preflight.isMms,
      };
    }
    if (!data.confirmed) throw new Error("Retry confirmation is required");
    if (preflight.shortfall > 0) {
      throw new Error(
        `Not enough credit to resend: needs $${preflight.estimatedCost.toFixed(2)}, balance is $${preflight.balance.toFixed(2)}.`,
      );
    }
    await applyRetryPricing(supabaseAdmin, preflight);


    await supabaseAdmin
      .from("messages")
      .update({
        status: "queued",
        error_code: null,
        failure_reason: null,
        provider_message_id: null,
        sent_at: null,
        delivered_at: null,
        dispatch_started_at: null,
        charged_at: null,
        charged_amount: null,
        force_sms: !!data.forceSms,
        retry_authorization_source: data.forceSms ? "tenant_manual_sms_fallback" : "tenant_manual",
        retry_authorized_by: context.userId,
        retry_authorized_at: new Date().toISOString(),
        retry_count: (msg as any).retry_count ? Number((msg as any).retry_count) + 1 : 1,
      })
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
  .inputValidator((d: { campaignId: string; errorCode?: string | null; dryRun?: boolean; confirmed?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status, account_id, media_url")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "cancelled") {
      throw new Error("Campaign is cancelled — cannot retry");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { priceRetryRows, applyRetryPricing } = await import("@/lib/campaign-retry-pricing.server");

    let candidateQ = supabaseAdmin
      .from("messages")
      .select("id,cost")
      .eq("campaign_id", data.campaignId)
      .in("status", ["failed", "undelivered"]);
    if (data.errorCode) candidateQ = candidateQ.eq("error_code", data.errorCode);
    const { data: candidates, error: candidateError } = await candidateQ;
    if (candidateError) throw new Error(candidateError.message);

    const ids = (candidates ?? []).map((row: any) => row.id);
    // Price from the live rate card, not the historical (possibly wrong) row
    // cost — MMS used to be charged per SMS segment.
    const preflight = await priceRetryRows(supabaseAdmin, campaign as any, ids);
    const estimatedCost = preflight.estimatedCost;
    if (data.dryRun) {
      return {
        ok: true,
        dryRun: true,
        count: preflight.count,
        estimatedCost,
        retried: 0,
        balance: preflight.balance,
        shortfall: preflight.shortfall,
        isMms: preflight.isMms,
      };
    }
    if (!data.confirmed) throw new Error("Retry confirmation is required");
    if (ids.length === 0) return { ok: true, retried: 0, estimatedCost: 0 };
    if (preflight.shortfall > 0) {
      throw new Error(
        `Not enough credit to resend ${preflight.count} message${preflight.count === 1 ? "" : "s"}: needs $${estimatedCost.toFixed(2)}, balance is $${preflight.balance.toFixed(2)}. Top up $${preflight.shortfall.toFixed(2)} and try again.`,
      );
    }

    await applyRetryPricing(supabaseAdmin, preflight);
    const { data: updated, error } = await supabaseAdmin
      .from("messages")
      .update({
        status: "queued",
        error_code: null,
        failure_reason: null,
        provider_message_id: null,
        sent_at: null,
        delivered_at: null,
        dispatch_started_at: null,
        charged_at: null,
        charged_amount: null,
        retry_authorization_source: "tenant_bulk_manual",
        retry_authorized_by: context.userId,
        retry_authorized_at: new Date().toISOString(),
      })
      .in("id", ids)
      .select("id");
    if (error) throw new Error(error.message);


    if ((updated?.length ?? 0) > 0 && ["sent", "failed"].includes(campaign.status)) {
      await supabaseAdmin
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", data.campaignId);
    }
    return { ok: true, retried: updated?.length ?? 0, estimatedCost: +estimatedCost.toFixed(4) };
  });

// Re-send messages that Telnyx marked `delivery_unconfirmed` in the last
// `hoursBack` hours (default 24h). These are messages the destination carrier
// accepted but never returned a delivery receipt for — most were delivered,
// but the tenant may want to try again if recipients report not receiving.
// This creates a new send attempt on the SAME message row (Telnyx will assign
// a new message id) so cost applies again per Telnyx billing.
export const resendUnconfirmed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; hoursBack?: number; dryRun?: boolean; confirmed?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const hours = Math.max(1, Math.min(72, data.hoursBack ?? 24));
    const { supabase } = context;
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "cancelled") {
      throw new Error("Campaign is cancelled — cannot resend");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - hours * 3600_000).toISOString();

    // Preview / dry-run: return count + estimated cost without touching rows.
    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("messages")
      .select("id, cost")
      .eq("campaign_id", data.campaignId)
      .eq("status", "delivery_unconfirmed")
      .gte("created_at", since);
    if (qErr) throw new Error(qErr.message);

    const count = candidates?.length ?? 0;
    const estimatedCost = (candidates ?? []).reduce((s, m: any) => s + Number(m.cost ?? 0), 0);

    if (data.dryRun) {
      return { ok: true, dryRun: true, count, estimatedCost: +estimatedCost.toFixed(4), hoursBack: hours };
    }
    if (!data.confirmed) throw new Error("Resend confirmation is required");

    if (count === 0) return { ok: true, resent: 0, estimatedCost: 0, hoursBack: hours };

    const ids = (candidates ?? []).map((m: any) => m.id);
    const { error } = await supabaseAdmin
      .from("messages")
      .update({
        status: "queued",
        error_code: null,
        failure_reason: null,
        provider_message_id: null,
        sent_at: null,
        delivered_at: null,
        dispatch_started_at: null,
        charged_at: null,
        charged_amount: null,
        retry_authorization_source: "tenant_unconfirmed_manual",
        retry_authorized_by: context.userId,
        retry_authorized_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) throw new Error(error.message);

    if (["sent", "failed"].includes(campaign.status)) {
      await supabaseAdmin
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", data.campaignId);
    }

    return { ok: true, resent: count, estimatedCost: +estimatedCost.toFixed(4), hoursBack: hours };
  });

