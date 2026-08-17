// Telnyx-backed campaign dispatcher. Sends via Telnyx Messages API scoped to
// each tenant's Messaging Profile. Twilio has been removed entirely.

import { createFileRoute } from "@tanstack/react-router";
import { calculateSegments } from "@/lib/sms-segments";
import { countryFromPhone } from "@/lib/country-from-phone";
import { keywordScan } from "@/lib/content-scanner";
import { publicCampaignMediaUrl } from "@/lib/campaign-media";

const PLAN_INSERT_CHUNK = 500;
// Recipients enriched + inserted per invocation. Bounds planning CPU cost to
// a fixed amount regardless of campaign size — previously the entire
// eligible list was enriched (segment calc, link rewriting, crypto RNG) in
// one shot, which is what exceeded the Worker's CPU time limit for large
// campaigns (e.g. 3,019 recipients in one request).
const PLAN_BATCH_SIZE = 2_000;
// Keep at least this many queued rows ready; above it, ticks send instead of plan.
const PLAN_BACKLOG_TARGET = 5_000;
// Keep each dispatcher invocation small enough to always finish inside the
// caller's HTTP timeout. If the caller (pg_cron/pg_net) hangs up mid-run the
// serverless worker is cancelled, leaving claimed rows stuck in `sending`
// which the next run then has to write off as `dispatch_timeout`.
// Keep claims small enough that every claimed row can be completed before the
// caller's timeout. Claiming more rows than the worker can finish leaves the
// remainder in `sending` until the stale-claim sweep runs.
// Claim enough work to keep the provider connection busy for most of this
// invocation. Claims are atomic, so concurrent scheduler calls cannot send the
// same message twice. With the scheduler fan-out this supports large campaigns
// without increasing per-process database connection pressure.
// Total messages one campaign may claim per invocation, spread across its
// lease slots (see LEASE_SHARDS). Each slot claims a fraction of this.
const DELIVER_PER_WORKER = 12_000;
// Total in-flight sends per campaign per invocation, also split across lease
// slots. Kept moderate on purpose: this project's Postgres tier caps out at 60
// connections and steady-state background usage already holds ~25, so stacking
// too many concurrent per-message status UPDATEs made some writes fail and left
// rows stuck at status='sending' (later swept as dispatch_timeout).
// Keep total concurrent carrier calls below the database connection ceiling.
// The previous limit of 36 only used a fraction of the verified toll-free
// throughput and made large queues take hours; 84 still leaves headroom for
// web traffic and delivery-receipt writes on the current backend tier.
const DELIVER_CONCURRENCY = 300;

// Soft wall-clock budget for one invocation. Anything left over is picked up by
// the next scheduled run instead of risking a mid-flight cancellation.
const RUN_BUDGET_MS = 40_000;
// Observed average end-to-end time for one message (carrier submit + status
// writes). Used to size each slot's claim to the time actually left.
const EST_SEND_MS = 1_100;

// How many workers may send for the SAME campaign at once. Message claiming is
// atomic (SELECT ... FOR UPDATE SKIP LOCKED), so parallel senders can never
// pick up the same recipient twice. Without this a single campaign was limited
// to one sender at a time, which is what made 100k sends take hours.
const LEASE_SHARDS = 12;
// How many send slots run concurrently inside one invocation (across all
// campaigns and lease shards).
const CAMPAIGN_CONCURRENCY = 12;
// Sentinel used when the lock helper is unavailable and we send unguarded.
const UNGUARDED_LEASE = "__unguarded__";


// ── Per-tenant throttling ────────────────────────────────────────────────────
// One tenant with a very large campaign used to be able to soak the whole
// invocation budget (and the whole provider connection pool), which made every
// other tenant's send crawl. These caps give each tenant a bounded share of a
// single tick and keep submission rates inside what each sender type is allowed
// to push through the carrier, so throughput stays high without tripping
// carrier-side spam/throughput filters.
//
// Caps are per sender kind, per tick (ticks fire every ~15s):
//   messages claimed per tenant per tick, and concurrent in-flight sends.
const TENANT_THROTTLE: Record<string, { perTick: number; concurrency: number }> = {
  // These are per-tenant totals for one invocation; they get divided across the
  // campaign's lease slots so each slot only claims what it can finish inside
  // the run budget. Claiming more than a slot can finish leaves the surplus
  // stuck in `sending` until the stale sweep writes it off as
  // `dispatch_timeout` — which is why big campaigns showed hundreds of them.
  toll_free: { perTick: 12_000, concurrency: 300 },
  ten_dlc: { perTick: 3_000, concurrency: 120 },
  short_code: { perTick: 12_000, concurrency: 300 },
  shared_toll_free: { perTick: 1_200, concurrency: 48 },
  personal: { perTick: 120, concurrency: 4 },
};
const TENANT_THROTTLE_DEFAULT = { perTick: 900, concurrency: 36 };


// Picture messages (MMS) are far more aggressively filtered than plain SMS.
// A large first-time burst from one number gets rejected wholesale by the
// recipient carriers (error 40008), so MMS sends are paced much slower
// regardless of sender kind.
const MMS_THROTTLE = { perTick: 120, concurrency: 4 };

// Order from most to least throughput. A tenant usually holds several sender
// assets (one per country), so picking "the first asset that has a kind" used
// to hand a verified toll-free tenant the slow default allowance whenever an
// alphabetically earlier country used a sender ID. Use the fastest kind the
// tenant actually holds instead.
const THROTTLE_KIND_PRIORITY = ["toll_free", "short_code", "ten_dlc", "shared_toll_free", "personal"];

function throttleForSender(sender: Sender, isMms = false) {
  const kinds = new Set(
    sender.assets.map((a) => (a.sender_kind ?? "").toLowerCase()).filter(Boolean),
  );
  const kind = THROTTLE_KIND_PRIORITY.find((k) => kinds.has(k)) ?? "";
  const base = TENANT_THROTTLE[kind] ?? TENANT_THROTTLE_DEFAULT;

  const capped = isMms
    ? { perTick: Math.min(base.perTick, MMS_THROTTLE.perTick), concurrency: Math.min(base.concurrency, MMS_THROTTLE.concurrency) }
    : base;
  return {
    perTick: Math.min(capped.perTick, DELIVER_PER_WORKER),
    concurrency: Math.min(capped.concurrency, DELIVER_CONCURRENCY),
  };
}



function render(body: string, p: { first_name?: string | null; last_name?: string | null; country_code?: string | null; phone_e164?: string | null; custom_fields?: Record<string, any> | null }) {
  const fields: Record<string, any> = {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    country: p.country_code ?? "",
    country_code: p.country_code ?? "",
    phone: p.phone_e164 ?? "",
    ...(p.custom_fields && typeof p.custom_fields === "object" ? p.custom_fields : {}),
  };
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = fields[key];
    return v == null ? "" : String(v);
  });
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? "https://xellvio.com").replace(/\/$/, "");
}

function supportsMms(countryCode?: string | null) {
  const cc = (countryCode ?? "").toUpperCase();
  return cc === "US" || cc === "CA";
}
function mediaLinkForMessage(messageId: string) {
  return `${publicBaseUrl()}/m/${messageId}`;
}
function fallbackMediaBody(body: string, messageId: string) {
  return `${body}\n\nImage: ${mediaLinkForMessage(messageId)}`;
}
// Carrier MMS gateways fetch the attachment themselves; long signed storage
// tokens (and their expiry) can make that fetch fail, which delivers the text
// without the image. Always hand the carrier our short, permanent URL.
function deliverableMediaUrl(mediaUrl: string) {
  return publicCampaignMediaUrl(mediaUrl, publicBaseUrl());
}


type Rate = {
  country_code: string;
  dial_prefix: string;
  sell_price: number;
  mms_multiplier: number;
  active: boolean;
};

type Sender = {
  messagingProfileId?: string | null;
  fromNumber?: string | null;
  gorgiasEnabled?: boolean;
  assets: Array<{
    country_code: string;
    sender_kind?: string | null;
    telnyx_messaging_profile_id?: string | null; // now stores telnyx messaging_profile_id
    phone_number?: string | null;
  }>;
};


/**
 * Page through the eligible list, skipping profiles that already have a
 * message row for this campaign, and return up to `batchSize` NEW ones plus
 * whether any more remain beyond that. This is what makes planning resumable
 * across ticks instead of an all-or-nothing single pass: each invocation
 * only enriches/inserts one bounded batch, and processCampaign() re-derives
 * "is this campaign fully planned yet" from `hasMore` rather than assuming
 * "any messages exist" means "fully planned."
 */
async function loadNextUnplannedBatch(
  supabaseAdmin: any,
  campaignId: string,
  accountId: string,
  audience: any,
  batchSize: number,
): Promise<{ recipients: any[]; hasMore: boolean }> {
  // One database call. The previous version paged every already-planned row
  // (1000 at a time) and then every eligible recipient just to diff them in
  // JavaScript — on a 100k audience that was ~130 HTTP round-trips per tick and
  // it consumed the whole invocation budget, so no message ever got sent.
  const { data, error } = await supabaseAdmin.rpc("unplanned_recipients_page", {
    _campaign_id: campaignId,
    _account_id: accountId,
    _audience: audience,
    _limit: batchSize,
  });
  if (error) throw error;
  const rows = data ?? [];
  const remaining = Number(rows[0]?.remaining ?? rows.length);
  return { recipients: rows, hasMore: remaining > rows.length };
}

function isShaftLikeCode(code: string): boolean {
  // 40001 = landline/non-routable and 40012 = invalid destination. Those are
  // recipient-data failures, not content violations, and must never suspend a
  // tenant. Only explicit carrier content-filter codes count here.
  return ["40010", "40011"].includes(code);
}

async function flagAccountForReview(supabaseAdmin: any, accountId: string, reason: string, detail: string) {
  try {
    const { data: acct } = await supabaseAdmin
      .from("accounts").select("email, suspended_at").eq("id", accountId).maybeSingle();
    if (acct?.suspended_at) return;
    await supabaseAdmin.from("accounts")
      .update({ suspended_at: new Date().toISOString(), onboarding_status: "suspended" })
      .eq("id", accountId);
    await supabaseAdmin.from("events").insert({
      type: "account_auto_suspended", account_id: accountId, payload: { reason, detail },
    });
  } catch (e) {
    console.error("[dispatch] flagAccountForReview failed", e);
  }
}

/**
 * A message row stuck at status='sending' is exactly what the dispatch_timeout
 * sweep in claim_campaign_messages later writes off — so every exit path in
 * sendOneMessage that's supposed to move a row OFF 'sending' must actually
 * land, not just be attempted. Plain `.update()` calls here previously never
 * checked the returned error, so a transient write failure (e.g. Postgres
 * connection pressure) was silently treated as success while the row stayed
 * on 'sending'. Retries a few times with backoff before giving up and
 * throwing, so a real failure is at least visible in logs instead of
 * manifesting two minutes later as an unexplained dispatch_timeout.
 */
async function writeWithRetry(
  supabaseAdmin: any,
  table: string,
  patch: Record<string, any>,
  match: Record<string, any>,
  attempts = 4,
): Promise<void> {
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    let q = supabaseAdmin.from(table).update(patch);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    if (!error) return;
    lastError = error;
    console.error(`[dispatch] ${table} update failed (attempt ${i + 1}/${attempts})`, JSON.stringify(match), error.message ?? error);
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  throw new Error(`Failed to update ${table} after ${attempts} attempts: ${lastError?.message ?? lastError}`);
}

// Buffered status writer. Recording each send with its own HTTP round-trip made
// the per-message cost dominate throughput on large campaigns; batching a few
// hundred results into one database call is what lets a single invocation push
// thousands of messages instead of a few dozen.
type StatusSink = { push: (row: Record<string, any>) => void };

function createStatusSink(supabaseAdmin: any, chunk = 200): StatusSink & { drain: () => Promise<void> } {
  let buf: Record<string, any>[] = [];
  let inflight: Promise<void> = Promise.resolve();

  const flushNow = async (rows: Record<string, any>[]) => {
    if (rows.length === 0) return;
    const { error } = await (supabaseAdmin as any).rpc("apply_message_status_batch", { _rows: rows });
    if (!error) return;
    console.error("[dispatch] batch status write failed, falling back per row", error.message);
    for (const r of rows) {
      const { id, ...patch } = r as any;
      try {
        await writeWithRetry(supabaseAdmin, "messages", patch, { id });
      } catch (e) {
        console.error("[dispatch] fallback status write failed", id, e);
      }
    }
  };

  return {
    push(row) {
      buf.push(row);
      if (buf.length >= chunk) {
        const rows = buf;
        buf = [];
        inflight = inflight.then(() => flushNow(rows));
      }
    },
    async drain() {
      const rows = buf;
      buf = [];
      await inflight;
      await flushNow(rows);
    },
  };
}

async function recordStatus(
  supabaseAdmin: any,
  sink: StatusSink | null | undefined,
  id: string,
  patch: Record<string, any>,
) {
  if (sink) { sink.push({ id, ...patch }); return; }
  await writeWithRetry(supabaseAdmin, "messages", patch, { id });
}

async function sendOneMessage(
  supabaseAdmin: any,
  campaign: any,
  sender: Sender,
  m: any,
  sink?: StatusSink | null,
): Promise<{ ok: boolean; shaft: boolean; debited: number; rateLimited?: boolean }> {
  const { sendMessage, safeTelnyxCall } = await import("@/lib/telnyx.server");
  try {
    const sendAsMms = !!campaign.media_url && supportsMms(m.country_code) && !m.force_sms;
    const messageBody =
      campaign.media_url && !sendAsMms && !m.force_sms ? fallbackMediaBody(m.rendered_body, m.id) : m.rendered_body;

    // Sender fallback rules — pick best available sender for this recipient.
    // Priority: US/CA → toll_free > local > sender_id; other countries → sender_id > local > toll_free.
    const cc = (m.country_code ?? "").toUpperCase();
    const isNanp = cc === "US" || cc === "CA";
    const rank = (kind: string | null | undefined) => {
      const k = kind ?? "";
      if (isNanp) return k === "toll_free" ? 0 : k === "local" ? 1 : k === "sender_id" ? 2 : 3;
      return k === "sender_id" ? 0 : k === "local" ? 1 : k === "toll_free" ? 2 : 3;
    };
    const candidates = sender.assets
      .filter((a) => {
        if (!(a.telnyx_messaging_profile_id || a.phone_number)) return false;
        if (a.country_code === m.country_code) return true;
        // Toll-free numbers approved in US or CA work for both (NANP TFV).
        if (
          isNanp &&
          a.sender_kind === "toll_free" &&
          (a.country_code === "US" || a.country_code === "CA")
        ) return true;
        return false;
      })
      .sort((a, b) => rank(a.sender_kind) - rank(b.sender_kind));
    const matched = candidates[0];

    if (!matched) {
      await recordStatus(supabaseAdmin, sink, m.id, {
        status: "failed",
        error_code: "sender_not_registered_for_country",
        failure_reason: `No verified sender configured for ${m.country_code ?? "unknown country"}`,
      });
      return { ok: false, shaft: false, debited: 0 };
    }
    const messagingProfileId = matched.telnyx_messaging_profile_id ?? sender.messagingProfileId ?? undefined;
    const fromNumber = matched.phone_number ?? sender.fromNumber ?? undefined;
    const senderKindUsed = matched.sender_kind ?? "unknown";
    const senderUsed = fromNumber ?? messagingProfileId ?? "unknown";

    if (!messagingProfileId && !fromNumber) {
      await recordStatus(supabaseAdmin, sink, m.id,
        { status: "failed", error_code: "no_sender", failure_reason: "No sender available" });
      return { ok: false, shaft: false, debited: 0 };
    }

    const result = await safeTelnyxCall(
      "send_message",
      { userId: campaign.account_id, messagingProfileId },
      () => sendMessage({
        to: m.phone_e164,
        text: messageBody,
        from: fromNumber ?? undefined,
        messagingProfileId: messagingProfileId ?? undefined,
        mediaUrls: sendAsMms ? [deliverableMediaUrl(campaign.media_url)] : undefined,
      }),
    );

    // MMS is one message with an attachment — it has no SMS segment count.
    const providerSegments = sendAsMms ? 1 : Number(result.parts ?? m.segments_count ?? 1);

    // Telnyx has already accepted this message — recording that fact is not
    // optional, so this write gets real retries rather than being fired and
    // forgotten. A failure here is what previously left rows stuck on
    // 'sending' despite a successful send, later misreported as
    // dispatch_timeout.
    await recordStatus(supabaseAdmin, sink, m.id, {
      status: "sent",
      provider_message_id: result.id,
      sent_at: new Date().toISOString(),
      segments_count: providerSegments,
      sender_used: senderUsed,
      sender_kind: senderKindUsed,
      // A successful retry supersedes the previous failed attempt. Leaving the
      // old error attached made an accepted message look failed while its new
      // delivery receipt was still pending.
      error_code: null,
      failure_reason: null,
    });
    try {
      // Audit rows are skipped while batching — the messages table stays the
      // source of truth and the extra round-trip would halve throughput.
      if (!sink) await writeWithRetry(supabaseAdmin, "message_send_attempts", {
        provider_message_id: result.id,
        provider_status: "sent",
        sent_at: new Date().toISOString(),
        error_code: null,
        failure_reason: null,
        finalized_at: null,
      }, { message_id: m.id, attempt_number: m.attempt_number }, 2);
    } catch (e) {
      // Audit-only table — the messages row above is the source of truth for
      // status, so don't fail the send over this.
      console.error("[dispatch] message_send_attempts update failed", e);
    }

    // If Telnyx billed more segments than we reserved from the tenant's
    // wallet at claim time, the platform absorbed the shortfall — flag it
    // for admin review instead of silently eating the cost.
    if (providerSegments > m.segments_count && m.segments_count > 0) {
      try {
        const shortfallSegments = providerSegments - m.segments_count;
        const perSegmentCost = Number(m.cost) / m.segments_count;
        const shortfallAmount = +(shortfallSegments * perSegmentCost).toFixed(4);
        if (shortfallAmount > 0) {
          const { data: existingCase } = await supabaseAdmin
            .from("financial_recovery_cases")
            .select("id, verified_uncovered_tenant_charge, evidence")
            .eq("account_id", campaign.account_id)
            .contains("campaign_ids", [campaign.id])
            .in("status", ["draft", "pending_provider"])
            .maybeSingle();
          const evidenceEntry = {
            message_id: m.id,
            phone_e164: m.phone_e164,
            reserved_segments: m.segments_count,
            billed_segments: providerSegments,
            shortfall_amount: shortfallAmount,
            detected_at: new Date().toISOString(),
          };
          if (existingCase) {
            const prevShortfalls = Array.isArray((existingCase.evidence as any)?.shortfalls) ? (existingCase.evidence as any).shortfalls : [];
            await supabaseAdmin.from("financial_recovery_cases").update({
              verified_uncovered_tenant_charge: Number(existingCase.verified_uncovered_tenant_charge) + shortfallAmount,
              evidence: { shortfalls: [...prevShortfalls, evidenceEntry] },
            }).eq("id", existingCase.id);
          } else {
            await supabaseAdmin.from("financial_recovery_cases").insert({
              account_id: campaign.account_id,
              title: `Segment undercharge — campaign "${campaign.name ?? campaign.id}"`,
              campaign_ids: [campaign.id],
              status: "draft",
              evidence_quality: "exact",
              verified_uncovered_tenant_charge: shortfallAmount,
              summary: "Telnyx billed more segments than reserved for one or more messages in this campaign. Auto-flagged by the dispatcher — no tenant collection or provider dispute has been initiated yet.",
              evidence: { shortfalls: [evidenceEntry] },
            });
          }
        }
      } catch (e) {
        console.error("[dispatch] recovery case creation failed", e);
      }
    }

    if (sender.gorgiasEnabled) {
      try {
        const { forwardSmsToGorgias } = await import("@/lib/gorgias.server");
        await forwardSmsToGorgias({
          accountId: campaign.account_id,
          phone: m.phone_e164,
          fromNumber: fromNumber ?? null,
          body: messageBody,
          direction: "outbound",
        });
      } catch (e) {
        console.error("[dispatch] gorgias mirror failed", e);
      }
    }

    return { ok: true, shaft: false, debited: Number(m.cost) };
  } catch (e: any) {
    const code = String(e?.telnyxCode ?? "");
    const reason = e?.telnyxMessage ?? e?.message ?? "Send failed";
    // Carrier rate limiting is transient, never a delivery failure. Put the
    // row straight back in the queue (it stays paid, so it is not charged
    // twice) and tell the caller to back off instead of burning thousands of
    // recipients as "failed" the moment we push too fast.
    const rateLimited = code === "10011" || /429|rate limit|maximum number of allowed requests/i.test(String(reason));
    if (rateLimited) {
      try {
        await recordStatus(supabaseAdmin, sink, m.id, {
          status: "queued",
          dispatch_started_at: null,
          error_code: null,
          failure_reason: null,
        });
      } catch (writeErr) {
        console.error("[dispatch] failed to requeue rate-limited message", m.id, writeErr);
      }
      return { ok: false, shaft: false, debited: 0, rateLimited: true };
    }
    try {
      await recordStatus(supabaseAdmin, sink, m.id,
        { status: "failed", error_code: code || "exception", failure_reason: String(reason).slice(0, 500) });
    } catch (writeErr) {
      // Last resort — this is the final handler, nothing left to fall back
      // to. Log loudly so it's visible instead of silently becoming a
      // dispatch_timeout two minutes from now with no trace of the real cause.
      console.error("[dispatch] FAILED to record message failure — row will be swept as dispatch_timeout", m.id, writeErr);
    }
    try {
      // Audit rows are skipped while batching — the messages table stays the
      // source of truth and the extra round-trip would halve throughput.
      if (!sink) await writeWithRetry(supabaseAdmin, "message_send_attempts", {
        provider_status: "failed",
        error_code: code || "exception",
        failure_reason: String(reason).slice(0, 500),
        finalized_at: new Date().toISOString(),
      }, { message_id: m.id, attempt_number: m.attempt_number }, 2);
    } catch (writeErr) {
      console.error("[dispatch] message_send_attempts failure-update failed", writeErr);
    }
    return { ok: false, shaft: isShaftLikeCode(code), debited: 0 };
  }
}


async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/**
 * One-time campaign-level setup: keyword prescan + full compliance
 * screening (including the AI review, when the keyword scan is clean) and
 * the "does this campaign have any eligible recipients at all" check. Runs
 * exactly once per campaign — processCampaign() only calls this when no
 * message rows exist yet for the campaign, since messages only start
 * getting inserted after this step passes.
 */
async function beginCampaignIfNeeded(
  supabaseAdmin: any, campaign: any, firstBatchRecipients: number,
): Promise<{ ok: true } | { ok: false; reason?: string }> {
  // ── Legacy fast keyword scan (kept for backwards compat with the badge).
  const preScan = keywordScan(campaign.message_body ?? "");
  if (!preScan.allowed) {
    await supabaseAdmin.from("campaigns")
      .update({ status: "blocked_content", paused_reason: preScan.reason }).eq("id", campaign.id);
    await flagAccountForReview(supabaseAdmin, campaign.account_id, "content_violation_dispatch", preScan.reason ?? "");
    return { ok: false, reason: "blocked_content" };
  }

  // Do not count the complete audience here. A 100k+ list can exceed the
  // database statement timeout before the first message row is created. The
  // bounded planner page is enough to prove that the audience is non-empty;
  // subsequent pages keep planning resumably across ticks.
  if (firstBatchRecipients === 0) {
    await supabaseAdmin.from("campaigns")
      .update({ status: "failed", paused_reason: "No eligible recipients — the selected audience was empty after exclusions" })
      .eq("id", campaign.id);
    return { ok: false, reason: "no_eligible_recipients" };
  }

  // ── Full compliance screening once per campaign (all body-scoped checks +
  //    volume anomaly, sized against the TOTAL eligible count, not a batch).
  //    Per-recipient frequency cap runs later in sendOneMessage.
  const { screenMessageContent } = await import("@/lib/content-screening.server");
  const screen = await screenMessageContent(campaign.message_body ?? "", campaign.account_id, {
    campaignId: campaign.id,
    plannedRecipients: firstBatchRecipients,
    context: "campaign_plan",
  });
  if (screen.action === "blocked") {
    await supabaseAdmin.from("campaigns")
      .update({
        status: "blocked_content",
        paused_reason: `Blocked by screening (risk ${screen.riskScore}/100): ${screen.blockedReasons[0] ?? "policy violation"}`,
      }).eq("id", campaign.id);
    return { ok: false, reason: "blocked_by_screening" };
  }
  if (screen.action === "held_for_review") {
    await supabaseAdmin.from("campaigns")
      .update({
        status: "paused",
        paused_reason: `Held for review (risk ${screen.riskScore}/100). ${screen.blockedReasons.slice(0, 2).join(" · ")}`,
        paused_at: new Date().toISOString(),
      }).eq("id", campaign.id);
    return { ok: false, reason: "held_for_review" };
  }

  return { ok: true };
}

/**
 * Enrich and insert ONE bounded batch of recipients as queued (or
 * insufficient-balance-failed) message rows. `recipients` is pre-selected by
 * the caller via loadNextUnplannedBatch, capped to PLAN_BATCH_SIZE — this
 * function never processes an entire campaign's recipient list in one call,
 * so its CPU cost stays bounded regardless of campaign size. `isFirstBatch`
 * gates the one-time side effects (campaign status transition, admin push,
 * the insufficient-balance-for-everyone failure path) that previously ran
 * exactly once per campaign and must still only run once now.
 */
async function planCampaign(
  supabaseAdmin: any, campaign: any, rates: Rate[], recipients: any[], isFirstBatch: boolean,
): Promise<{ planned: number; skipped: number; cost: number; reason?: string }> {
  const dial = rates.map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }));
  const rateByCC: Record<string, Rate> = {};
  for (const r of rates) rateByCC[r.country_code] = r;
  const hasMedia = !!campaign.media_url;
  // An MMS is ONE billable message with an attachment — it has no SMS
  // segments, so it must never be priced as segments x rate x multiplier.
  // Recipients in countries without MMS support fall back to plain SMS and
  // are therefore priced per segment at the normal SMS rate.
  const priceFor = (rate: Rate | undefined, cc: string | null | undefined, segs: number) => {
    if (!rate) return { cost: 0, isMms: false, billedSegments: segs };
    const unit = Number(rate.sell_price);
    const isMms = hasMedia && supportsMms(cc);
    if (isMms) return { cost: +(unit * Number(rate.mms_multiplier)).toFixed(4), isMms, billedSegments: 1 };
    return { cost: +(segs * unit).toFixed(4), isMms, billedSegments: segs };
  };

  const enriched = recipients.map((p: any) => {
    const body = render(campaign.message_body, p);
    const seg = calculateSegments(body);
    const cc = p.country_code || countryFromPhone(p.phone_e164, dial);
    const rate = cc ? rateByCC[cc] : undefined;
    const priced = priceFor(rate, cc, seg.segments);
    return { ...p, body, segments: seg.segments, country_code: cc, cost: priced.cost };
  });



  const totalCost = +enriched.reduce((s: number, x: any) => s + x.cost, 0).toFixed(4);

  const { data: acct, error: aErr } = await supabaseAdmin
    .from("accounts").select("credit_balance").eq("id", campaign.account_id).maybeSingle();
  if (aErr || !acct) throw new Error("Account lookup failed");
  const startingBalance = Number(acct.credit_balance);

  enriched.sort((a: any, b: any) => a.cost - b.cost);
  let remaining = startingBalance;
  const queuedRows: any[] = [];
  const failedRows: any[] = [];
  const linkRows: any[] = [];
  const URL_RE = /(https?:\/\/[^\s<>()\[\]"']+)/gi;
  const SHORT_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const shortCode = (len = 8) => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < len; i++) out += SHORT_ALPHABET[bytes[i] % SHORT_ALPHABET.length];
    return out;
  };
  const base = publicBaseUrl();
  // Opt-in only: URLs are sent exactly as the tenant typed them unless they
  // explicitly turned link shortening on for this campaign.
  const trackLinks = campaign.track_links === true;

  // Match short URLs we already generated (preview shortlinks from the builder).
  // Escape the base for regex use. Then skip re-shortening those and instead
  // just backfill message_id/campaign_id so they still count toward this send.
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SHORT_RE = new RegExp(`^${escapedBase}/r/([a-zA-Z0-9]{4,16})$`);
  const existingShortsToBind: Array<{ short_code: string; message_id: string }> = [];
  const rewriteBody = (body: string, messageId: string): string => {
    if (!trackLinks) return body;
    return body.replace(URL_RE, (originalUrl) => {
      const m = originalUrl.match(SHORT_RE);
      if (m) {
        // Already a xellvio.com/r/<code> link (preview shortlink). Keep as-is
        // but attach this message to it so per-recipient sends aggregate cleanly.
        existingShortsToBind.push({ short_code: m[1], message_id: messageId });
        return originalUrl;
      }
      const code = shortCode(8);
      linkRows.push({
        short_code: code,
        message_id: messageId,
        campaign_id: campaign.id,
        account_id: campaign.account_id,
        url: originalUrl,
      });
      return `${base}/r/${code}`;
    });
  };


  for (const r of enriched) {
    const messageId = crypto.randomUUID();
    const rewritten = rewriteBody(r.body, messageId);
    // Recompute segments after rewrite in case link length changed the count.
    const segs = calculateSegments(rewritten).segments;
    const rate = rateByCC[r.country_code];
    const priced = priceFor(rate, r.country_code, segs);
    const cost = priced.cost;
    const rowBase = {
      id: messageId,
      campaign_id: campaign.id,
      profile_id: r.profile_id,
      phone_e164: r.phone_e164,
      country_code: r.country_code,
      // MMS is a single message, not N SMS segments.
      segments_count: priced.billedSegments,
      is_mms: priced.isMms,
      cost,
      rendered_body: rewritten,
    };

    if (cost === 0) queuedRows.push({ ...rowBase, status: "queued" });
    else if (cost <= remaining) { remaining -= cost; queuedRows.push({ ...rowBase, status: "queued" }); }
    else failedRows.push({ ...rowBase, status: "failed", error_code: "insufficient_balance" });
  }

  // Upsert with ignoreDuplicates rather than a plain insert: this is the
  // hard backstop against ever double-planning (and therefore double-
  // charging/double-sending) a recipient, regardless of whether the
  // in-memory `planned` exclusion set above is ever wrong for any reason.
  // Relies on the messages_campaign_profile_unique constraint.
  const allRows = [...queuedRows, ...failedRows];
  for (let i = 0; i < allRows.length; i += PLAN_INSERT_CHUNK) {
    const chunk = allRows.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: insErr } = await supabaseAdmin
      .from("messages")
      .upsert(chunk, { onConflict: "campaign_id,profile_id", ignoreDuplicates: true });
    if (insErr) throw new Error(`Failed to insert message batch: ${insErr.message}`);
  }

  // Insert link_clicks rows only for messages that actually got queued (not
  // insufficient_balance failures — those never send, so no click can happen).
  const queuedIds = new Set(queuedRows.map((r) => r.id));
  const linksToInsert = linkRows.filter((l) => queuedIds.has(l.message_id));
  for (let i = 0; i < linksToInsert.length; i += PLAN_INSERT_CHUNK) {
    const chunk = linksToInsert.slice(i, i + PLAN_INSERT_CHUNK);
    const { error: linkErr } = await supabaseAdmin.from("link_clicks").insert(chunk);
    if (linkErr) console.error("[dispatch] link_clicks insert failed", linkErr.message);
  }

  // Backfill preview shortlinks (created in the builder before dispatch) with
  // this campaign so their clicks show up on this campaign's report.
  if (existingShortsToBind.length > 0) {
    const codes = Array.from(new Set(existingShortsToBind.map((x) => x.short_code)));
    await supabaseAdmin
      .from("link_clicks")
      .update({ campaign_id: campaign.id })
      .in("short_code", codes)
      .is("campaign_id", null);
  }

  // Only the FIRST batch can conclude "nothing could be queued for anyone" —
  // a later batch returning zero queued rows (e.g. balance ran out mid-
  // campaign) must not overwrite a campaign that already has earlier
  // messages queued/sent from previous ticks.
  if (queuedRows.length === 0 && isFirstBatch) {
    // Distinguish "nobody was eligible" from "balance couldn't cover anyone":
    // reporting the latter for an empty audience is misleading.
    const reason = failedRows.length > 0 ? "insufficient_balance" : "no_eligible_recipients";
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "failed",
        paused_reason:
          reason === "insufficient_balance"
            ? "Not enough credit to send to any recipient"
            : "No eligible recipients — the selected audience was empty after exclusions",
      })
      .eq("id", campaign.id);
    return { planned: 0, skipped: failedRows.length, cost: totalCost, reason };
  }
  if (isFirstBatch) {
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
    try {
      const { sendAdminPush } = await import("@/lib/admin-push.server");
      const { data: acct } = await supabaseAdmin.from("accounts")
        .select("full_name, email, contact_email").eq("id", campaign.account_id).maybeSingle();
      const who = acct?.full_name || acct?.contact_email || acct?.email || "A tenant";
      await sendAdminPush({
        title: "Campaign started",
        body: `${who} is sending "${campaign.name ?? "Untitled"}".`,
        url: `/admin/messages`,
        tag: `camp-start-${campaign.id}`,
      });
    } catch (e) { console.error("[dispatch] push start failed", e); }
  } else if (queuedRows.length > 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  }
  return { planned: queuedRows.length, skipped: failedRows.length, cost: totalCost };
}

async function deliverPending(
  supabaseAdmin: any, campaign: any, sender: Sender,
  limits?: { perTick: number; concurrency: number; deadlineAt?: number },
): Promise<{ sent: number; failed: number; debited: number; remaining: number; cancelled?: boolean; throttled?: boolean }> {
  const { data: fresh } = await supabaseAdmin
    .from("campaigns").select("status").eq("id", campaign.id).maybeSingle();
  if (fresh?.status === "cancelled") {
    return { sent: 0, failed: 0, debited: 0, remaining: 0, cancelled: true };
  }

  const throttle = limits ?? throttleForSender(sender, !!campaign.media_url);
  const concurrency = Math.max(1, Math.min(DELIVER_CONCURRENCY, throttle.concurrency));
  // Never claim more than this slot can actually finish before the invocation
  // has to return. Surplus claimed rows sit at status='sending' and later get
  // written off as `dispatch_timeout`, which is what made reports show
  // thousands of unexplained failures on big campaigns.
  const msLeft = limits?.deadlineAt ? limits.deadlineAt - Date.now() : RUN_BUDGET_MS;
  const budgetClaim = Math.floor((Math.max(0, msLeft) / EST_SEND_MS) * concurrency);
  const claimLimit = Math.max(0, Math.min(DELIVER_PER_WORKER, throttle.perTick, budgetClaim));
  if (claimLimit === 0) {
    const { count: pending } = await supabaseAdmin
      .from("messages").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
    return { sent: 0, failed: 0, debited: 0, remaining: pending ?? 0, throttled: true };
  }

  // Claim in small chunks. A single large claim runs hundreds of per-row
  // charge/ledger writes inside one statement and hit the database statement
  // timeout, which aborted the whole tick and left campaigns idle for hours.
  const CLAIM_CHUNK = 150;
  // Adaptive in-flight limit: drops when the carrier rate-limits us, recovers
  // once requests are being accepted again.
  let effectiveConcurrency = concurrency;
  let sent = 0, failed = 0, debited = 0, shaftErrors = 0;
  let claimedTotal = 0;
  const unsent: string[] = [];
  const hardDeadline = limits?.deadlineAt ?? Date.now() + RUN_BUDGET_MS;
  const sink = createStatusSink(supabaseAdmin);

  while (claimedTotal < claimLimit && Date.now() < hardDeadline - 3_000) {
    const want = Math.min(CLAIM_CHUNK, claimLimit - claimedTotal);
    const { data: batch, error: qErr } = await supabaseAdmin.rpc("claim_campaign_messages", {
      _campaign_id: campaign.id,
      _limit: want,
    });
    if (qErr) {
      // Transient claim failure (timeout/contention): stop claiming and keep
      // whatever we already sent instead of failing the tick.
      console.error("[dispatch] claim failed", qErr.message);
      break;
    }
    const rows = batch ?? [];
    if (rows.length === 0) break;
    claimedTotal += rows.length;
    let rateLimitHits = 0;
    await runWithConcurrency(rows, effectiveConcurrency, async (m: any) => {
      if (Date.now() >= hardDeadline) { unsent.push(m.id); return; }
      const r = await sendOneMessage(supabaseAdmin, campaign, sender, m, sink);
      if (r.ok) { sent++; debited += r.debited; }
      else if (r.rateLimited) { rateLimitHits++; }
      else { failed++; if (r.shaft) shaftErrors++; }
    });
    if (rateLimitHits > 0) {
      // The carrier told us we are pushing too fast. Halve the in-flight
      // requests and pause briefly instead of hammering it — the requeued
      // rows go out on the next pass at a sustainable rate.
      effectiveConcurrency = Math.max(4, Math.floor(effectiveConcurrency / 2));
      await new Promise((r) => setTimeout(r, Math.min(2_000, 200 * rateLimitHits)));
    } else if (effectiveConcurrency < concurrency) {
      effectiveConcurrency = Math.min(concurrency, effectiveConcurrency * 2);
    }
  }

  // Every accepted/failed result must be persisted before this invocation
  // returns, otherwise the stale sweep would write successful sends off as
  // dispatch timeouts.
  await sink.drain();

  if (claimedTotal === 0) {
    const { count: stillPending } = await supabaseAdmin
      .from("messages").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
    if ((stillPending ?? 0) === 0) {
      await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
    }
    return { sent: 0, failed: 0, debited: 0, remaining: stillPending ?? 0 };
  }

  // Hand anything we ran out of time for back to the queue so the next tick
  // sends it instead of the stale sweep failing it.
  for (let i = 0; i < unsent.length; i += 200) {
    await supabaseAdmin.from("messages")
      .update({ status: "queued" })
      .in("id", unsent.slice(i, i + 200))
      .eq("status", "sending");
  }



  if (shaftErrors >= 2) {
    await flagAccountForReview(supabaseAdmin, campaign.account_id, "shaft_carrier_errors",
      `${shaftErrors} messages blocked by carrier for prohibited content. Campaign ${campaign.id}.`);
  }

  const { count: remaining } = await supabaseAdmin
    .from("messages").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
  if ((remaining ?? 0) === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
  } else {
    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);
  }
  return { sent, failed, debited: +debited.toFixed(4), remaining: remaining ?? 0 };
}

async function processCampaign(
  supabaseAdmin: any, campaign: any, rates: Rate[], sender: Sender,
  limits?: { perTick: number; concurrency: number; deadlineAt?: number },
): Promise<any> {
  const { count: existing } = await supabaseAdmin
    .from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id);
  const isFirstBatch = (existing ?? 0) === 0;

  // Delivery has priority over planning. When a healthy backlog of queued rows
  // already exists, spend the whole invocation sending it instead of preparing
  // more recipients — that is what keeps a 100k campaign draining at full rate.
  const { count: backlog } = await supabaseAdmin
    .from("messages").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id).eq("status", "queued");
  const shouldPlan = isFirstBatch || (backlog ?? 0) < PLAN_BACKLOG_TARGET;

  // Planning must never abort a tick: if the audience lookup is slow or times
  // out, keep sending the rows that are already queued.
  let recipients: any[] = [];
  let hasMore = true;
  if (shouldPlan) {
    try {
      const page = await loadNextUnplannedBatch(
        supabaseAdmin, campaign.id, campaign.account_id,
        campaign.audience ?? { include: [], exclude: [] }, PLAN_BATCH_SIZE,
      );
      recipients = page.recipients;
      hasMore = page.hasMore;
    } catch (e: any) {
      console.error("[dispatch] planning lookup failed, delivering queued rows instead", e?.message ?? e);
    }
  }

  if (isFirstBatch) {
    const begin = await beginCampaignIfNeeded(supabaseAdmin, campaign, recipients.length);
    if (!begin.ok) return { planned: 0, skipped: 0, cost: 0, reason: begin.reason };
  }

  const planned = recipients.length > 0
    ? await planCampaign(supabaseAdmin, campaign, rates, recipients, isFirstBatch)
    : { planned: 0, skipped: 0, cost: 0 };

  if (planned.planned === 0 && isFirstBatch && recipients.length > 0) {
    // Nothing could be queued at all (e.g. insufficient balance for every
    // recipient) — planCampaign already marked the campaign failed.
    return planned;
  }

  // Send from the rows already planned on every tick, even while later
  // recipient pages are still being planned. Large campaigns therefore begin
  // immediately instead of showing zero progress for several cron intervals.
  const delivered = await deliverPending(supabaseAdmin, campaign, sender, limits);
  return {
    ...planned,
    planning_remaining: hasMore,
    delivered_now: delivered.sent,
    failed_now: delivered.failed,
    remaining: delivered.remaining,
    throttled: delivered.throttled ?? false,
  };
}


async function reconcileStaleCarrierReceipts(
  supabaseAdmin: any,
  opts: { maxPerRun?: number; concurrency?: number; minAgeMs?: number } = {},
): Promise<{ checked: number; updated: number; stillAwaiting: number; expired: number }> {
  // Many US/CA MMS and international carriers never return a final delivery
  // receipt at all — the carrier accepted and finalized the message and simply
  // stays silent. Waiting 24h left whole campaigns parked on "Awaiting", so
  // after 3h with no receipt we preserve the provider's unconfirmed result
  // internally; user-facing reports classify that terminal outcome as failed.
  const giveUpCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: expiredRows } = await supabaseAdmin
    .from("messages")
    .update({
      status: "delivery_unconfirmed",
      failure_reason: "Carrier accepted the message but never returned a delivery receipt (waited 3 hours).",
    })
    .eq("status", "sent")
    .lt("sent_at", giveUpCutoff)
    .select("id");
  const expired = (expiredRows ?? []).length;

  const checkedRecentlyCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const sentCutoff = new Date(Date.now() - (opts.minAgeMs ?? 3 * 60 * 1000)).toISOString();
  // Reconcile enough receipts to keep pace with large campaigns. The previous
  // 100-row ceiling allowed thousands of accepted messages to remain in the
  // report long after final receipts were available.
  const maxPerRun = opts.maxPerRun ?? 500;
  const toCheck: Array<{ id: string; provider_message_id: string; status: string }> = [];
  const pageSize = 500;
  for (let from = 0; from < 20_000 && toCheck.length < maxPerRun; from += pageSize) {
    const { data: candidates } = await supabaseAdmin
      .from("messages")
      .select("id, provider_message_id, status")
      .eq("status", "sent")
      .lt("sent_at", sentCutoff)
      .not("provider_message_id", "is", null)
      .filter("provider_message_id", "not.ilike", "SM%")
      .order("sent_at", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1);

    const rows = (candidates ?? []) as Array<{ id: string; provider_message_id: string; status: string }>;
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.id);
    const { data: recentChecks } = await supabaseAdmin
      .from("events")
      .select("message_id")
      .in("message_id", ids)
      .eq("type", "reconcile:checked:sent")
      .gte("created_at", checkedRecentlyCutoff);
    const recentlyChecked = new Set((recentChecks ?? []).map((e: any) => e.message_id));
    toCheck.push(...rows.filter((r) => !recentlyChecked.has(r.id)).slice(0, maxPerRun - toCheck.length));
    if (rows.length < pageSize) break;
  }
  if (toCheck.length === 0) return { checked: 0, updated: 0, stillAwaiting: 0, expired };


  const { getMessage, mapTelnyxStatus } = await import("@/lib/telnyx.server");
  let updated = 0;
  let stillAwaiting = 0;
  await runWithConcurrency(toCheck, opts.concurrency ?? 20, async (m) => {
    try {
      const j = await getMessage(m.provider_message_id);
      const first = Array.isArray(j?.to) ? j.to[0] : null;
      const rawStatus = first?.status ?? j?.status ?? "";
      const errCode = first?.errors?.[0]?.code ?? j?.errors?.[0]?.code ?? null;
      const errDetail = first?.errors?.[0]?.detail ?? first?.errors?.[0]?.title ?? j?.errors?.[0]?.detail ?? j?.errors?.[0]?.title ?? null;
      let newStatus = mapTelnyxStatus(rawStatus);
      if (newStatus === "sent" && errCode) newStatus = "undelivered";
      if (newStatus === "sent") {
        stillAwaiting += 1;
        await supabaseAdmin.from("events").insert({
          message_id: m.id,
          type: "reconcile:checked:sent",
          payload: { provider_status: rawStatus || null },
        });
        return;
      }
      const update: any = { status: newStatus };
      if (newStatus === "delivered") update.delivered_at = new Date().toISOString();
      if (errCode) update.error_code = String(errCode);
      if (errDetail) update.failure_reason = String(errDetail).slice(0, 500);
      if (newStatus === "delivery_unconfirmed" && !errDetail) {
        update.failure_reason = "Carrier finalized the message without a delivery confirmation.";
      }
      await supabaseAdmin.from("messages").update(update).eq("id", m.id);
      await supabaseAdmin.from("events").insert({ message_id: m.id, type: `reconcile:${newStatus}`, payload: j });
      updated += 1;
    } catch (e) {
      await supabaseAdmin.from("events").insert({
        message_id: m.id,
        type: "reconcile:error",
        payload: { error: String(e) },
      });
    }
  });
  return { checked: toCheck.length, updated, stillAwaiting, expired };
}

export const Route = createFileRoute("/api/public/dispatch-campaign")({

  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const validApiKeys = new Set([
          process.env.SUPABASE_PUBLISHABLE_KEY,
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          process.env.SUPABASE_ANON_KEY,
          // Fallback so the cron trigger keeps working even if the env var is
          // missing on a deployment. Must match the key the cron jobs send.
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw",
        ].filter((value): value is string => Boolean(value)));
        if (!apiKey || !validApiKeys.has(apiKey)) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!process.env.TELNYX_API_KEY) {
          return Response.json({ error: "Telnyx not configured" }, { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Dedicated receipt-reconciliation mode. Runs on its own cron schedule
        // so pulling final delivery receipts never competes with the sending
        // budget (that's what left thousands of messages stuck on "awaiting").
        const mode = new URL(request.url).searchParams.get("mode") ?? request.headers.get("x-dispatch-mode");
        if (mode === "reconcile") {
          const result = await reconcileStaleCarrierReceipts(supabaseAdmin, {
            maxPerRun: 3000,
            concurrency: 40,
            minAgeMs: 90_000,
          });
          return Response.json({ mode: "reconcile", ...result });
        }



        // Campaign-level leases (acquired inside runDispatchTick) let several
        // scheduler ticks send for different campaigns at the same time. A
        // single global lock used to serialize every tenant's sending, which
        // is what made large campaigns crawl for hours.
        return await runDispatchTick(supabaseAdmin);
      },
    },
  },
});


async function runDispatchTick(supabaseAdmin: any): Promise<Response> {
        const { data: ratesRows } = await supabaseAdmin
          .from("country_rates")
          .select("country_code,dial_prefix,sell_price,mms_multiplier,active")
          .eq("active", true);
        const rates = (ratesRows ?? []) as Rate[];

        const nowIso = new Date().toISOString();

        // ── Auto-approve expired review-queue entries and requeue their campaigns.
        const nowExpiry = new Date().toISOString();
        const { data: expiredReviews } = await supabaseAdmin
          .from("review_queue")
          .select("id, campaign_id")
          .eq("status", "pending")
          .lte("auto_approve_at", nowExpiry);
        for (const r of expiredReviews ?? []) {
          await supabaseAdmin.from("review_queue")
            .update({ status: "auto_approved", resolved_at: nowExpiry })
            .eq("id", r.id);
          if (r.campaign_id) {
            await supabaseAdmin.from("campaigns")
              .update({ status: "queued", paused_reason: null })
              .eq("id", r.campaign_id).eq("status", "paused");
          }
        }

        // ── Self-heal: any campaign that got marked `failed` (or `sent`) while
        // it still has queued recipients is stranded — nothing would ever pick
        // it up again. Put it back into the sending queue before we build the
        // due list. Cancelled and paused campaigns are intentionally excluded.
        try {
          const { data: stranded } = await supabaseAdmin
            .from("messages")
            .select("campaign_id")
            .eq("status", "queued")
            .limit(5000);
          const strandedIds = Array.from(new Set((stranded ?? []).map((r: any) => r.campaign_id))).filter(Boolean);
          if (strandedIds.length > 0) {
            await supabaseAdmin
              .from("campaigns")
              .update({ status: "sending", paused_reason: null })
              .in("id", strandedIds)
              .in("status", ["failed", "sent"]);
          }
        } catch (e: any) {
          console.error("[dispatch] stranded-campaign revival failed", e?.message ?? e);
        }


        const { data: due, error } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .or(`status.eq.queued,status.eq.sending,and(status.eq.scheduled,schedule_at.lte.${nowIso})`)
          // Oldest-updated first creates a round-robin queue: processing a
          // campaign touches updated_at, moving it behind the other tenants on
          // the next tick instead of letting one large campaign monopolize the
          // first dispatch slot indefinitely.
          .order("updated_at", { ascending: true })
          .limit(20);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const startedAt = Date.now();
        const budgetLeft = () => RUN_BUDGET_MS - (Date.now() - startedAt);

        const results: any[] = [];
        let deferred = 0;
        // Messages already claimed for each tenant during this tick. Multiple
        // campaigns from the same tenant share one budget so a tenant can never
        // occupy more than its fair share of the invocation or of the carrier's
        // allowed submission rate.
        const tenantUsed = new Map<string, number>();

        // Try each lease slot in turn; the first free slot wins. Returns the
        // acquired lease name, or null when every slot is busy.
        async function acquireCampaignLease(campaignId: string): Promise<string | null> {
          for (let shard = 0; shard < LEASE_SHARDS; shard += 1) {
            const name = `campaign:${campaignId}:${shard}`;
            const { data: got, error: lockError } = await (supabaseAdmin as any).rpc(
              "try_acquire_dispatch_lock",
              { _name: name },
            );
            if (lockError) {
              // Lock helper unavailable (e.g. missing after a DB move): never
              // freeze sending — run unguarded, claiming is atomic anyway.
              console.error("[dispatch] lock unavailable, running unguarded", lockError.message);
              return UNGUARDED_LEASE;
            }
            if (got) return name;
          }
          return null;
        }

        const runOneCampaign = async (c: any): Promise<any> => {
          const { data: acct } = await supabaseAdmin
            .from("accounts")
            .select("telnyx_messaging_profile_id, telnyx_phone_number, onboarding_status, sending_suspended_at, tos_current_version_accepted, gorgias_enabled")
            .eq("id", c.account_id).maybeSingle();
          if (acct?.onboarding_status === "suspended" || acct?.sending_suspended_at) {
            await supabaseAdmin.from("campaigns")
              .update({ status: "paused", paused_reason: "Tenant sending suspended", paused_at: new Date().toISOString() })
              .eq("id", c.id);
            return { error: "tenant_sending_suspended" };
          }
          // ── ToS gate: tenant must have accepted the current version.
          const { TOS_CURRENT_VERSION } = await import("@/lib/tos");
          if (acct?.tos_current_version_accepted !== TOS_CURRENT_VERSION) {
            await supabaseAdmin.from("campaigns")
              .update({ status: "paused", paused_reason: "Tenant must accept updated Terms of Service before sending.", paused_at: new Date().toISOString() })
              .eq("id", c.id);
            return { error: "tos_acceptance_required" };
          }
          // ── Per-campaign compliance re-confirmation must exist.
          const { count: campTos } = await supabaseAdmin
            .from("campaign_tos_acceptances")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .eq("tos_version", TOS_CURRENT_VERSION);
          if ((campTos ?? 0) === 0) {
            await supabaseAdmin.from("campaigns")
              .update({ status: "paused", paused_reason: "Missing per-campaign compliance confirmation.", paused_at: new Date().toISOString() })
              .eq("id", c.id);
            return { error: "campaign_acceptance_required" };
          }

          const { data: senderAssets } = await supabaseAdmin
            .from("sender_assets")
            .select("verification_status,country_code,sender_kind,phone_number,telnyx_messaging_profile_id")
            .eq("account_id", c.account_id);
          const verifiedSender = (senderAssets ?? []).find(
            (s: any) => s.verification_status === "verified" && (s.telnyx_messaging_profile_id || s.phone_number),
          );
          if ((senderAssets ?? []).length > 0 && !verifiedSender) {
            return { skipped: "sender_pending_verification" };
          }
          const { isValidTelnyxUuid, ensureMessagingProfileForAccount } = await import("@/lib/telnyx.server");
          // Auto-provision the Telnyx Messaging Profile if none valid on this account.
          let profileId: string | null = isValidTelnyxUuid(acct?.telnyx_messaging_profile_id)
            ? (acct!.telnyx_messaging_profile_id as string)
            : null;
          if (!profileId) {
            try {
              profileId = await ensureMessagingProfileForAccount(c.account_id);
            } catch (e: any) {
              await supabaseAdmin.from("campaigns").update({
                status: "failed",
                paused_reason: `Could not prepare a sending profile: ${e?.message ?? e}`,
              }).eq("id", c.id);
              return { error: `profile_provision_failed: ${e?.message ?? e}` };
            }
          }
          const assetProfileId = isValidTelnyxUuid(verifiedSender?.telnyx_messaging_profile_id)
            ? (verifiedSender!.telnyx_messaging_profile_id as string)
            : null;
          const sender: Sender = {
            messagingProfileId: assetProfileId ?? profileId,
            fromNumber: verifiedSender?.phone_number ?? acct?.telnyx_phone_number ?? null,
            gorgiasEnabled: acct?.gorgias_enabled === true,
            assets: (senderAssets ?? []).filter((s: any) => s.verification_status === "verified"),
          };
          const throttle = throttleForSender(sender, !!c.media_url);
          // The tenant allowance is a per-invocation total; each lease slot gets
          // a share of it so parallel slots add throughput without exceeding the
          // carrier-safe submission rate or claiming more than a slot can finish.
          const slotPerTick = Math.max(20, Math.ceil(throttle.perTick / LEASE_SHARDS));
          const slotConcurrency = Math.max(2, Math.ceil(throttle.concurrency / LEASE_SHARDS));
          const used = tenantUsed.get(c.account_id) ?? 0;
          const perTick = Math.max(0, Math.min(slotPerTick, throttle.perTick - used));
          if (perTick === 0) {
            return { skipped: "tenant_throttle_reached" };
          }
          // Reserve optimistically so concurrent slots for the same tenant do
          // not each claim the full allowance.
          tenantUsed.set(c.account_id, used + perTick);
          const r = await processCampaign(supabaseAdmin, c, rates, sender, {
            perTick,
            concurrency: slotConcurrency,
            deadlineAt: startedAt + RUN_BUDGET_MS,

          });

          const actual = Number(r?.delivered_now ?? 0) + Number(r?.failed_now ?? 0);
          tenantUsed.set(c.account_id, used + Math.min(perTick, actual));
          return r;
        };

        // Work list: each due campaign appears once per lease slot, interleaved
        // so every campaign gets its first slot before any campaign gets a
        // second one. That keeps round-robin fairness across tenants while
        // letting a single large campaign use several parallel senders.
        const dueList = due ?? [];
        const queue: any[] = [];
        for (let pass = 0; pass < LEASE_SHARDS; pass += 1) {
          for (const c of dueList) queue.push(c);
        }

        let cursor = 0;
        const campaignWorkers = Array.from(
          { length: Math.min(CAMPAIGN_CONCURRENCY, queue.length) },
          async () => {
            while (cursor < queue.length) {
              if (budgetLeft() < 6_000) {
                deferred += queue.length - cursor;
                cursor = queue.length;
                break;
              }
              const c = queue[cursor++];
              const lease = await acquireCampaignLease(c.id);
              if (!lease) {
                // Every slot for this campaign is busy — another worker (here or
                // in an overlapping invocation) is already sending it.
                continue;
              }
              try {
                results.push({ id: c.id, ...(await runOneCampaign(c)) });
              } catch (e: any) {
                // A transient tick error (provider hiccup, DB timeout) must never
                // abandon a campaign that still has work queued — marking it
                // `failed` drops it out of the dispatch queue and strands every
                // remaining recipient forever. Keep it `sending` so the next tick
                // picks it up; only mark failed when nothing is left to send.
                const { count: leftover } = await supabaseAdmin
                  .from("messages").select("id", { count: "exact", head: true })
                  .eq("campaign_id", c.id).in("status", ["queued", "sending"]);
                const { count: everPlanned } = await supabaseAdmin
                  .from("messages").select("id", { count: "exact", head: true })
                  .eq("campaign_id", c.id);
                const note = `Temporary send error, retrying: ${e?.message ?? e}`;
                if ((leftover ?? 0) > 0) {
                  await supabaseAdmin.from("campaigns")
                    .update({ status: "sending", paused_reason: note }).eq("id", c.id);
                } else if ((everPlanned ?? 0) === 0) {
                  // Nothing was ever planned: the tick blew up before a single
                  // recipient row existed. Failing here strands the whole
                  // campaign, so put it back in the queue for the next tick.
                  await supabaseAdmin.from("campaigns")
                    .update({ status: "queued", paused_reason: note }).eq("id", c.id);
                } else {
                  await supabaseAdmin.from("campaigns")
                    .update({ status: "failed", paused_reason: e?.message ?? "Send failed" }).eq("id", c.id);
                }
                console.error("[dispatch] campaign tick failed", c.id, e?.message ?? e);
                results.push({ id: c.id, error: e.message, retryable: true });
              } finally {
                if (lease !== UNGUARDED_LEASE) {
                  await (supabaseAdmin as any).rpc("release_dispatch_lock", { _name: lease });
                }
              }
            }
          },
        );
        await Promise.all(campaignWorkers);


        // Recovery and reconciliation are best-effort housekeeping. Run them
        // only after outbound work so they can never consume the send budget.
        let recoveredInbound: { checked: number; processed: number } | { checked: number; processed: number; error: string } = { checked: 0, processed: 0 };
        if (budgetLeft() > 18_000) {
          try {
            const { recoverRecentTelnyxInboundMessages } = await import("@/lib/telnyx-inbound-routing.server");
            recoveredInbound = await recoverRecentTelnyxInboundMessages(50);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[dispatch] inbound recovery failed", message);
            recoveredInbound = { checked: 0, processed: 0, error: message };
          }
        }
        const reconciled = budgetLeft() > 12_000
          ? await reconcileStaleCarrierReceipts(supabaseAdmin)
          : { checked: 0, updated: 0, stillAwaiting: 0, expired: 0, skipped: true };
        return Response.json({ processed: results.length, deferred, recoveredInbound, reconciled, results });
}
