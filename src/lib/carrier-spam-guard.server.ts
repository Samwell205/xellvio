/**
 * Server side of the carrier spam-rejection gate (see carrier-spam-guard.ts
 * for the policy). All coordination uses the existing atomic
 * `try_acquire_dispatch_lock` primitive (INSERT … ON CONFLICT DO NOTHING) and
 * conditional campaign writes, so overlapping workers/invocations can never
 * exceed the initial-submission cap, double-pause, or double-notify. Every
 * lock/stat failure defers (fail closed): no paid claim or provider call is
 * made while the gate state is unknown.
 *
 * No schema changes: gate state lives in named `dispatch_locks` rows, the
 * durable incident + retryable email outbox lives in `events`, and email
 * visibility lives in `email_send_log`.
 */
import {
  SPAM_GATE_INITIAL_SUBMISSIONS,
  SPAM_GATE_FEEDBACK_WAIT_MS,
  SPAM_GATE_RECEIPT_READ_LIMIT,
  SPAM_PAUSE_REASON,
  FEEDBACK_TIMEOUT_REASON,
  SPAM_GATE_INCIDENT_EVENT,
  spamGateSlotName,
  spamGateSlotPrefix,
  spamGateReleasedName,
  spamGateConcludedName,
  spamGateIncidentName,
  summarizeFinalizedReceipts,
  evaluateSpamGate,
  buildSpamIncidentEmail,
  type SpamGateStats,
} from "./carrier-spam-guard";
import { DISPATCHABLE_STATUSES } from "./dispatch-campaign-guard";

const SITE_NAME = "xellvio";
const SENDER_DOMAIN = "notify.xellvio.com";
const FROM_DOMAIN = "xellvio.com";
const FROM_ADDRESS = `Xellvio <admin@${FROM_DOMAIN}>`;

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "https://xellvio.com").replace(/\/$/, "");
}

export type GateLocks = {
  released: boolean;
  concluded: boolean;
  submissions: number;
  /** acquired_at of submission slot #1, ms epoch; null before the first send. */
  startedAtMs: number | null;
};

/** Read the durable gate markers. Returns null on ANY read error so callers
 * defer instead of guessing. */
export async function readGateLocks(db: any, campaignId: string): Promise<GateLocks | null> {
  const { data, error } = await db
    .from("dispatch_locks")
    .select("name,acquired_at")
    .like("name", `spamgate:${campaignId}:%`);
  if (error || !Array.isArray(data)) return null;
  let released = false;
  let concluded = false;
  let submissions = 0;
  let startedAtMs: number | null = null;
  const prefix = spamGateSlotPrefix(campaignId);
  for (const row of data) {
    const name = String(row.name ?? "");
    if (name === spamGateReleasedName(campaignId)) released = true;
    else if (name === spamGateConcludedName(campaignId)) concluded = true;
    else if (name.startsWith(prefix)) {
      submissions += 1;
      if (name === spamGateSlotName(campaignId, 1)) {
        const t = new Date(String(row.acquired_at ?? "")).getTime();
        startedAtMs = Number.isFinite(t) ? t : null;
      }
    }
  }
  return { released, concluded, submissions, startedAtMs };
}

async function acquireNamedLock(db: any, name: string): Promise<boolean | null> {
  try {
    const { data, error } = await db.rpc("try_acquire_dispatch_lock", { _name: name });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

/**
 * Claim one of the 25 initial carrier submissions for a gated campaign.
 * "claimed" = this worker may make ONE paid provider call; "full" = the gate
 * budget is spent, wait for feedback; "unavailable" = coordination failed,
 * defer (fail closed — never send unguarded).
 */
export async function tryClaimGateSubmission(
  db: any,
  campaignId: string,
): Promise<"claimed" | "full" | "unavailable"> {
  const locks = await readGateLocks(db, campaignId);
  if (!locks) return "unavailable";
  if (locks.submissions >= SPAM_GATE_INITIAL_SUBMISSIONS) return "full";
  // Claim the lowest unclaimed slot. Each slot is an atomic
  // INSERT … ON CONFLICT DO NOTHING, so concurrent workers can never hold
  // the same slot.
  for (let n = locks.submissions + 1; n <= SPAM_GATE_INITIAL_SUBMISSIONS; n += 1) {
    const got = await acquireNamedLock(db, spamGateSlotName(campaignId, n));
    if (got === null) return "unavailable";
    if (got) return "claimed";
  }
  return "full";
}

/**
 * Distinct finalized carrier receipts for this campaign, read from the
 * immutable per-attempt receipt table (NOT messages.status — the audit found
 * rows marked "sent" whose stored finalized receipt was a 40002 refusal).
 * Bounded read; returns null on error (unknown → never treated as spam).
 */
export async function loadFinalizedReceiptStats(db: any, campaignId: string): Promise<SpamGateStats | null> {
  const { data, error } = await db
    .from("message_send_attempts")
    .select("provider_message_id,message_id,error_code,provider_status")
    .eq("campaign_id", campaignId)
    .not("finalized_at", "is", null)
    .order("finalized_at", { ascending: true })
    .limit(SPAM_GATE_RECEIPT_READ_LIMIT);
  if (error || !Array.isArray(data)) return null;
  return summarizeFinalizedReceipts(data);
}

export type GatePauseResult =
  | { paused: true; incident: string }
  | { paused: false; reason: "stopped" | "race_lost" | "update_failed" };

/**
 * Pause the remaining sends of a live campaign for a spam-gate reason.
 * Re-reads the live status (cancellation race) and writes conditionally on
 * the campaign still being dispatchable, so a stopped/cancelled/final
 * campaign is never resurrected. The incident/notification is recorded only
 * by the worker that wins the pause write.
 */
export async function pauseCampaignForSpamGate(
  db: any,
  campaign: { id: string; account_id: string; name?: string | null },
  stats: SpamGateStats,
  kind: "spam" | "feedback_timeout",
): Promise<GatePauseResult> {
  const { data: live, error: readErr } = await db
    .from("campaigns").select("status,paused_reason").eq("id", campaign.id).maybeSingle();
  if (readErr) return { paused: false, reason: "update_failed" };
  if (!live || !(DISPATCHABLE_STATUSES as readonly string[]).includes(String(live.status))) {
    return { paused: false, reason: "stopped" };
  }
  const reason = kind === "spam" ? SPAM_PAUSE_REASON : FEEDBACK_TIMEOUT_REASON;
  const { data: updated, error: upErr } = await db
    .from("campaigns")
    .update({ status: "paused", paused_reason: reason, paused_at: new Date().toISOString() })
    .eq("id", campaign.id)
    .in("status", [...DISPATCHABLE_STATUSES])
    .select("id");
  if (upErr) return { paused: false, reason: "update_failed" };
  if (!Array.isArray(updated) || updated.length !== 1) return { paused: false, reason: "race_lost" };
  // The pause stands even if notification fails — email problems never undo it.
  try {
    await recordSpamGateIncident(db, campaign, stats, { paused: true, kind });
  } catch (e) {
    console.error("[spam-gate] incident recording failed (pause kept)", campaign.id, e);
  }
  return { paused: true, incident: "recorded" };
}

// ── Durable incident + retryable email outbox ───────────────────────────────

function incidentIdempotencyKey(campaignId: string): string {
  return `spamgate-incident-${campaignId}`;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type IncidentPayload = {
  campaign_id: string;
  account_id: string;
  kind: "spam" | "feedback_timeout";
  paused: boolean;
  finalized: number;
  spam: number;
  recipient_email: string | null;
  email_status: "pending" | "queued" | "suppressed" | "no_recipient" | "pending_retry";
  email_error?: string | null;
  email?: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotency_key: string;
    unsubscribe_token: string | null;
  };
  recorded_at: string;
};

async function enqueueIncidentEmail(db: any, email: NonNullable<IncidentPayload["email"]>): Promise<{ ok: boolean; error?: string }> {
  // Visibility row first: "pending" until the queue accepts it. Enqueue
  // success is recorded as "queued" — never claimed as delivered.
  await db.from("email_send_log").insert({
    message_id: email.idempotency_key,
    template_name: "campaign-spam-incident",
    recipient_email: email.to,
    status: "pending",
  });
  const { error } = await db.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: email.idempotency_key,
      to: email.to,
      from: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      subject: email.subject,
      html: email.html,
      text: email.text,
      purpose: "transactional",
      label: "campaign-spam-incident",
      idempotency_key: email.idempotency_key,
      ...(email.unsubscribe_token ? { unsubscribe_token: email.unsubscribe_token } : {}),
      queued_at: new Date().toISOString(),
      site_name: SITE_NAME,
    },
  });
  if (error) {
    await db.from("email_send_log").insert({
      message_id: email.idempotency_key,
      template_name: "campaign-spam-incident",
      recipient_email: email.to,
      status: "failed",
      error_message: String(error.message ?? "enqueue failed").slice(0, 1000),
    });
    return { ok: false, error: String(error.message ?? "enqueue failed") };
  }
  await db.from("email_send_log").insert({
    message_id: email.idempotency_key,
    template_name: "campaign-spam-incident",
    recipient_email: email.to,
    status: "queued",
  });
  return { ok: true };
}

export type IncidentOutcome =
  | { created: true; emailStatus: IncidentPayload["email_status"] }
  | { created: false; reason: "duplicate" | "lock_unavailable" | "record_failed" };

/**
 * Create the ONE durable incident for a campaign spam-gate pause (or the
 * receipt-side notice for a campaign whose sends all finished before the
 * final results arrived). Atomic dedupe via a dedicated dispatch lock:
 * concurrent callbacks produce exactly one incident and one email. The
 * events row doubles as the email outbox: a failed enqueue leaves
 * email_status="pending_retry" for retrySpamGateIncidentEmails.
 *
 * Deliberately does NOT use sendBrandedEmail/enqueueRawBrandedEmail: their
 * check-then-insert dedupe on email_send_log races under concurrency and
 * treats any prior log row (even "failed") as already-sent.
 */
export async function recordSpamGateIncident(
  db: any,
  campaign: { id: string; account_id: string; name?: string | null },
  stats: SpamGateStats,
  opts: { paused: boolean; kind: "spam" | "feedback_timeout" },
): Promise<IncidentOutcome> {
  const got = await acquireNamedLock(db, spamGateIncidentName(campaign.id));
  if (got === null) return { created: false, reason: "lock_unavailable" };
  if (!got) return { created: false, reason: "duplicate" };
  // Monitoring for this campaign ends with its incident — no retro notices.
  await acquireNamedLock(db, spamGateConcludedName(campaign.id));

  // Server-owned recipient: the account's contact email, falling back to the
  // account email. Never a recipient phone number.
  const { data: acct } = await db
    .from("accounts").select("email,contact_email").eq("id", campaign.account_id).maybeSingle();
  const recipient = String(acct?.contact_email ?? acct?.email ?? "").trim().toLowerCase();

  const payload: IncidentPayload = {
    campaign_id: campaign.id,
    account_id: campaign.account_id,
    kind: opts.kind,
    paused: opts.paused,
    finalized: stats.finalized,
    spam: stats.spam,
    recipient_email: recipient || null,
    email_status: "pending",
    recorded_at: new Date().toISOString(),
  };

  if (!recipient) {
    payload.email_status = "no_recipient";
  } else {
    const { data: suppressed } = await db
      .from("suppressed_emails").select("email").eq("email", recipient).maybeSingle();
    if (suppressed) {
      payload.email_status = "suppressed";
      await db.from("email_send_log").insert({
        message_id: incidentIdempotencyKey(campaign.id),
        template_name: "campaign-spam-incident",
        recipient_email: recipient,
        status: "suppressed",
        error_message: "Recipient is on the suppression list",
      });
    } else {
      let unsubscribeToken: string | null = null;
      try {
        const token = generateToken();
        const { data: row } = await db
          .from("email_unsubscribe_tokens")
          .upsert({ email: recipient, token }, { onConflict: "email" })
          .select("token")
          .maybeSingle();
        unsubscribeToken = row?.token ?? token;
      } catch (e) {
        console.warn("[spam-gate] could not mint unsubscribe token", e);
      }
      const content = buildSpamIncidentEmail({
        campaignId: campaign.id,
        campaignName: String(campaign.name ?? ""),
        stats,
        paused: opts.paused,
        kind: opts.kind,
        baseUrl: publicBaseUrl(),
      });
      payload.email = {
        to: recipient,
        subject: content.subject,
        html: content.html,
        text: content.text,
        idempotency_key: incidentIdempotencyKey(campaign.id),
        unsubscribe_token: unsubscribeToken,
      };
    }
  }

  const { data: inserted, error: insErr } = await db
    .from("events")
    .insert({ type: SPAM_GATE_INCIDENT_EVENT, account_id: campaign.account_id, payload })
    .select("id");
  if (insErr || !Array.isArray(inserted) || inserted.length !== 1) {
    console.error("[spam-gate] incident insert failed", campaign.id, insErr?.message ?? insErr);
    return { created: false, reason: "record_failed" };
  }

  if (payload.email) {
    const sent = await enqueueIncidentEmail(db, payload.email);
    payload.email_status = sent.ok ? "queued" : "pending_retry";
    payload.email_error = sent.ok ? null : (sent.error ?? "enqueue failed");
    await db.from("events").update({ payload }).eq("id", inserted[0].id);
  }
  return { created: true, emailStatus: payload.email_status };
}

/**
 * Retry incident emails whose first enqueue failed. Runs from the dispatcher
 * invocation itself, so it keeps working while the affected campaign is
 * paused (paused campaigns drop out of the due list). Bounded per run.
 */
export async function retrySpamGateIncidentEmails(
  db: any,
  opts: { limit?: number } = {},
): Promise<{ scanned: number; queued: number; stillPending: number; failed: number }> {
  const limit = opts.limit ?? 10;
  const { data, error } = await db
    .from("events")
    .select("id,payload")
    .eq("type", SPAM_GATE_INCIDENT_EVENT)
    .filter("payload->>email_status", "eq", "pending_retry")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !Array.isArray(data)) return { scanned: 0, queued: 0, stillPending: 0, failed: 1 };
  let queued = 0, stillPending = 0;
  for (const row of data) {
    const payload = row.payload as IncidentPayload | null;
    if (!payload?.email) { stillPending += 1; continue; }
    const result = await enqueueIncidentEmail(db, payload.email);
    if (result.ok) {
      payload.email_status = "queued";
      payload.email_error = null;
      queued += 1;
    } else {
      payload.email_error = result.error ?? "enqueue failed";
      stillPending += 1;
    }
    await db.from("events").update({ payload }).eq("id", row.id);
  }
  return { scanned: data.length, queued, stillPending, failed: 0 };
}

// ── Dispatcher entry points ──────────────────────────────────────────────────

export type SpamGateCheck =
  | { action: "proceed"; mode: "open" | "gated" }
  | { action: "wait" | "defer" | "paused"; reason: string };

/**
 * Decide what the dispatcher may do with a monitored campaign this tick.
 * Fail closed everywhere: any lock/stat read error defers the campaign (no
 * paid claim, no provider call).
 */
export async function spamGatePrecheck(db: any, campaign: { id: string; account_id: string; name?: string | null }): Promise<SpamGateCheck> {
  const locks = await readGateLocks(db, campaign.id);
  if (!locks) return { action: "defer", reason: "gate_state_unavailable" };
  if (locks.concluded) return { action: "proceed", mode: "open" };

  if (locks.released) {
    // Gate passed — normal parallel delivery, but keep monitoring subsequent
    // bounded batches: a later wave of spam refusals still pauses the rest.
    const stats = await loadFinalizedReceiptStats(db, campaign.id);
    if (!stats) return { action: "defer", reason: "receipt_stats_unavailable" };
    if (evaluateSpamGate(stats).decision === "pause_spam") {
      const r = await pauseCampaignForSpamGate(db, campaign, stats, "spam");
      if (r.paused) return { action: "paused", reason: "spam_threshold" };
      if (r.reason === "stopped") return { action: "paused", reason: "already_stopped" };
      return { action: "defer", reason: "pause_write_failed" };
    }
    return { action: "proceed", mode: "open" };
  }

  if (locks.submissions < SPAM_GATE_INITIAL_SUBMISSIONS) {
    return { action: "proceed", mode: "gated" };
  }

  // Gate budget spent — wait for carrier feedback before releasing more.
  const stats = await loadFinalizedReceiptStats(db, campaign.id);
  if (!stats) return { action: "defer", reason: "receipt_stats_unavailable" };
  const verdict = evaluateSpamGate(stats);
  if (verdict.decision === "pause_spam") {
    const r = await pauseCampaignForSpamGate(db, campaign, stats, "spam");
    if (r.paused) return { action: "paused", reason: "spam_threshold" };
    if (r.reason === "stopped") return { action: "paused", reason: "already_stopped" };
    return { action: "defer", reason: "pause_write_failed" };
  }
  if (verdict.decision === "pass") {
    const marked = await acquireNamedLock(db, spamGateReleasedName(campaign.id));
    if (marked === null) return { action: "defer", reason: "gate_state_unavailable" };
    return { action: "proceed", mode: "open" };
  }
  // Not enough finalized results yet. Bounded wait: after the timeout the
  // remainder stays stopped with a truthful reason — unknown is never
  // silently released and never labelled as spam.
  const waitedMs = locks.startedAtMs == null ? Number.POSITIVE_INFINITY : Date.now() - locks.startedAtMs;
  if (waitedMs >= SPAM_GATE_FEEDBACK_WAIT_MS) {
    const r = await pauseCampaignForSpamGate(db, campaign, stats, "feedback_timeout");
    if (r.paused) return { action: "paused", reason: "feedback_timeout" };
    if (r.reason === "stopped") return { action: "paused", reason: "already_stopped" };
    return { action: "defer", reason: "pause_write_failed" };
  }
  return { action: "wait", reason: "awaiting_carrier_feedback" };
}

/**
 * Receipt-side conclusion for a monitored campaign whose sends all finished
 * (possibly before the final receipts arrived). If the spam threshold is
 * met, record the incident and notify honestly — without pretending unsent
 * work was stopped. Either way the campaign is marked concluded so no
 * retroactive notice is ever sent for historical campaigns.
 */
export async function concludeMonitoredCampaign(
  db: any,
  campaign: { id: string; account_id: string; name?: string | null },
): Promise<{ concluded: boolean; incident: boolean }> {
  const locks = await readGateLocks(db, campaign.id);
  if (!locks) return { concluded: false, incident: false };
  if (locks.concluded) return { concluded: true, incident: false };
  const marked = await acquireNamedLock(db, spamGateConcludedName(campaign.id));
  if (marked === null) return { concluded: false, incident: false };
  const stats = await loadFinalizedReceiptStats(db, campaign.id);
  if (stats && evaluateSpamGate(stats).decision === "pause_spam") {
    try {
      const r = await recordSpamGateIncident(db, campaign, stats, { paused: false, kind: "spam" });
      return { concluded: true, incident: r.created };
    } catch (e) {
      console.error("[spam-gate] completion incident failed", campaign.id, e);
      return { concluded: true, incident: false };
    }
  }
  return { concluded: true, incident: false };
}
