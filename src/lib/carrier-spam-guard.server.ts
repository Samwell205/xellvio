/**
 * Server side of the carrier spam-rejection gate (see carrier-spam-guard.ts
 * for the policy). ALL coordination state lives in the campaign_spam_*
 * tables and is mutated only by the service-role-only SQL functions from
 * db-proposals/20261022-campaign-spam-monitor.sql:
 *
 *  - spam_gate_claim is the ONLY claim path: it locks the campaign and
 *    monitor rows, re-checks live status and account hold, bounds the paid
 *    claim to the gate allowance and invokes the existing
 *    claim_campaign_messages inside the same transaction.
 *  - spam_gate_record_receipt is fed only by the signature-verified
 *    message.finalized webhook and keeps immutable, deduped final facts.
 *  - Pause + incident + outbox shell are one transaction
 *    (spam_gate_do_pause), so a crash after a pause can never lose the
 *    notice; the outbox row is discoverable until the email is enqueued.
 *
 * Every RPC failure defers (fail closed): no paid claim, no provider call,
 * no release while the gate state is unknown.
 */
import {
  SPAM_GATE_INITIAL_SUBMISSIONS,
  SPAM_GATE_FEEDBACK_WAIT_MS,
  SPAM_GATE_MIN_RECIPIENTS,
  buildSpamIncidentEmail,
  resolveIncidentRecipient,
  type SpamGateMonitorState,
} from "./carrier-spam-guard";

const SITE_NAME = "xellvio";
const SENDER_DOMAIN = "notify.xellvio.com";
const FROM_DOMAIN = "xellvio.com";
const FROM_ADDRESS = `Xellvio <admin@${FROM_DOMAIN}>`;

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "https://xellvio.com").replace(/\/$/, "");
}

export type SpamGateState = {
  enrolled: boolean;
  state: SpamGateMonitorState | null;
  submitted: number;
  finalized: number;
  spam: number;
  expectedTotal: number | null;
  waitingSinceMs: number | null;
};

/** Read the monitor state. Returns null on ANY read error so callers defer
 * instead of guessing. Unenrolled campaigns return { enrolled: false }. */
export async function spamGateState(db: any, campaignId: string): Promise<SpamGateState | null> {
  const { data, error } = await db.rpc("spam_gate_state", { _campaign_id: campaignId });
  if (error || !Array.isArray(data)) return null;
  const row = data[0];
  if (!row) {
    return { enrolled: false, state: null, submitted: 0, finalized: 0, spam: 0, expectedTotal: null, waitingSinceMs: null };
  }
  const waited = row.waiting_since ? new Date(String(row.waiting_since)).getTime() : null;
  return {
    enrolled: true,
    state: (row.state ?? null) as SpamGateMonitorState | null,
    submitted: Number(row.submitted_count ?? 0),
    finalized: Number(row.finalized_count ?? 0),
    spam: Number(row.spam_count ?? 0),
    expectedTotal: row.expected_total == null ? null : Number(row.expected_total),
    waitingSinceMs: Number.isFinite(waited) ? waited : null,
  };
}

export type SpamGateCheck =
  | { action: "proceed"; mode: "open" | "gated"; enrolled: boolean }
  | { action: "wait" | "defer" | "paused"; reason: string };

/**
 * Advisory precheck for the dispatcher. Authoritative enforcement happens
 * inside spam_gate_claim under the row locks; this only decides the tick's
 * posture (and fails closed on any read error).
 */
export async function spamGatePrecheck(db: any, campaign: { id: string }): Promise<SpamGateCheck> {
  const s = await spamGateState(db, campaign.id);
  if (!s) return { action: "defer", reason: "gate_state_unavailable" };
  if (!s.enrolled) return { action: "proceed", mode: "open", enrolled: false };
  if (s.state === "paused_spam") return { action: "paused", reason: "spam_threshold" };
  if (s.state === "paused_timeout") return { action: "paused", reason: "feedback_timeout" };
  if (s.state === "concluded" || s.state === "released") return { action: "proceed", mode: "open", enrolled: true };
  // monitoring
  const capped = s.expectedTotal == null || s.expectedTotal >= SPAM_GATE_MIN_RECIPIENTS;
  if (!capped) return { action: "proceed", mode: "open", enrolled: true };
  if (s.submitted < SPAM_GATE_INITIAL_SUBMISSIONS) return { action: "proceed", mode: "gated", enrolled: true };
  if (s.waitingSinceMs != null && Date.now() - s.waitingSinceMs >= SPAM_GATE_FEEDBACK_WAIT_MS) {
    // The wrapper performs the atomic feedback-timeout pause at claim time.
    return { action: "paused", reason: "feedback_timeout" };
  }
  return { action: "wait", reason: "awaiting_carrier_feedback" };
}

/**
 * The ONLY way dispatch claims paid message work. The SQL wrapper checks
 * live campaign status + account hold and atomically bounds the claim to the
 * gate allowance before invoking the existing claim_campaign_messages.
 * Errors defer — there is deliberately no fallback to the bare claim.
 */
export async function claimGatedMessages(
  db: any,
  campaignId: string,
  limit: number,
): Promise<{ ok: true; rows: any[] } | { ok: false; error: string }> {
  const { data, error } = await db.rpc("spam_gate_claim", { _campaign_id: campaignId, _limit: limit });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, rows: Array.isArray(data) ? data : [] };
}

/**
 * Register persistent monitoring for a newly launched campaign. The SQL
 * refuses enrollment for any campaign that already has submitted/reserved/
 * attempted work, so pre-rollout campaigns are never enrolled or notified.
 * Returns null on error (caller defers the launch — fail closed).
 */
export async function enrollCampaignForSpamGate(db: any, campaignId: string): Promise<boolean | null> {
  const { data, error } = await db.rpc("spam_gate_enroll", { _campaign_id: campaignId });
  if (error) return null;
  return data === true;
}

/** Planning finished: record the true recipient total (cap applies only >25). */
export async function setSpamGateExpectedTotal(db: any, campaignId: string, total: number): Promise<boolean> {
  const { error } = await db.rpc("spam_gate_set_expected_total", { _campaign_id: campaignId, _total: total });
  return !error;
}

export type SpamGateReceiptResult =
  | { ok: true; result: "recorded" | "duplicate" | "stale" | "unenrolled" | "paused" | "concluded" | string }
  | { ok: false; error: string };

/**
 * Feed one signature-verified message.finalized fact into the gate. The SQL
 * matches the message's CURRENT provider id exactly (old retry ids are
 * ignored), dedupes replays, and atomically pauses + records the incident +
 * creates the outbox shell when the spam threshold is met.
 */
export async function recordSpamGateReceipt(
  db: any,
  args: {
    campaignId: string;
    messageId: string;
    providerMessageId: string;
    errorCode: string | null;
    providerStatus: string;
    finalizedAt: string;
  },
): Promise<SpamGateReceiptResult> {
  const { data, error } = await db.rpc("spam_gate_record_receipt", {
    _campaign_id: args.campaignId,
    _message_id: args.messageId,
    _provider_message_id: args.providerMessageId,
    _error_code: args.errorCode,
    _provider_status: args.providerStatus,
    _finalized_at: args.finalizedAt,
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, result: String(data ?? "recorded") };
}

// ── Durable incident email outbox ────────────────────────────────────────────

function incidentIdempotencyKey(campaignId: string): string {
  return `spamgate-incident-${campaignId}`;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type OutboxRow = {
  id: string;
  campaign_id: string;
  account_id: string;
  status: "pending" | "queued" | "sent" | "failed" | "suppressed" | "missing";
  payload?: any;
};

async function markOutbox(db: any, id: string, status: string, error: string | null, retryDelaySeconds = 300): Promise<void> {
  await db.rpc("spam_gate_outbox_mark", {
    _outbox_id: id, _status: status, _error: error, _retry_delay_seconds: retryDelaySeconds,
  });
}

async function logEmail(db: any, campaignId: string, to: string, status: string, errorMessage?: string | null): Promise<void> {
  await db.from("email_send_log").insert({
    message_id: incidentIdempotencyKey(campaignId),
    template_name: "campaign-spam-incident",
    recipient_email: to,
    status,
    ...(errorMessage ? { error_message: String(errorMessage).slice(0, 1000) } : {}),
  });
}

export type OutboxProcessResult = {
  scanned: number;
  enqueued: number;
  sent: number;
  failedTerminal: number;
  suppressed: number;
  missing: number;
  stillPending: number;
  failed: number;
};

/**
 * Drive the durable incident-email outbox. Runs from the dispatcher
 * invocation itself, so it keeps working while the affected campaign is
 * paused (paused campaigns drop out of the due list) and even when no
 * campaign is due at all. Bounded per run; every error leaves the row
 * 'pending' with backoff (deferred, never dropped).
 */
export async function processSpamGateEmailOutbox(
  db: any,
  opts: { limit?: number } = {},
): Promise<OutboxProcessResult> {
  const limit = opts.limit ?? 10;
  const result: OutboxProcessResult = {
    scanned: 0, enqueued: 0, sent: 0, failedTerminal: 0, suppressed: 0, missing: 0, stillPending: 0, failed: 0,
  };
  const { data, error } = await db.rpc("spam_gate_outbox_due", { _limit: limit });
  if (error || !Array.isArray(data)) { result.failed = 1; return result; }
  result.scanned = data.length;

  for (const row of data as OutboxRow[]) {
    try {
      if (row.status === "queued") {
        // Enqueued ≠ delivered: reconcile real visibility from the email log.
        const { data: logs } = await db
          .from("email_send_log")
          .select("status")
          .eq("message_id", incidentIdempotencyKey(row.campaign_id))
          .order("created_at", { ascending: false })
          .limit(5);
        const statuses = (logs ?? []).map((l: any) => String(l.status ?? ""));
        if (statuses.includes("sent")) {
          await markOutbox(db, row.id, "sent", null);
          result.sent += 1;
        } else if (statuses.some((s) => s === "failed" || s === "bounced")) {
          await markOutbox(db, row.id, "failed", "Email delivery failed");
          result.failedTerminal += 1;
        } else {
          result.stillPending += 1;
        }
        continue;
      }

      // status === 'pending': build (or rebuild after a crash) and enqueue.
      const { data: incident } = await db
        .from("campaign_spam_incidents")
        .select("kind,paused,finalized,spam")
        .eq("campaign_id", row.campaign_id)
        .maybeSingle();
      const { data: campaign } = await db
        .from("campaigns").select("name").eq("id", row.campaign_id).maybeSingle();
      const { data: account, error: acctErr } = await db
        .from("accounts").select("email,contact_email").eq("id", row.account_id).maybeSingle();
      if (acctErr) {
        // Lookup failure is transient: leave pending for the next run — never
        // record a permanent "missing" on a read error.
        result.stillPending += 1;
        continue;
      }
      const recipient = resolveIncidentRecipient(account);
      if (!recipient) {
        await markOutbox(db, row.id, "missing", "Account has no contact or login email");
        result.missing += 1;
        continue;
      }

      // Recheck suppression immediately before enqueueing — a bounce added
      // during an outage must stop the retry too.
      const { data: suppressed } = await db
        .from("suppressed_emails").select("email").eq("email", recipient).maybeSingle();
      if (suppressed) {
        await markOutbox(db, row.id, "suppressed", "Recipient is on the suppression list");
        await logEmail(db, row.campaign_id, recipient, "suppressed", "Recipient is on the suppression list");
        result.suppressed += 1;
        continue;
      }

      let unsubscribeToken: string | null = null;
      try {
        const token = generateToken();
        const { data: tok } = await db
          .from("email_unsubscribe_tokens")
          .upsert({ email: recipient, token }, { onConflict: "email" })
          .select("token")
          .maybeSingle();
        unsubscribeToken = tok?.token ?? token;
      } catch (e) {
        console.warn("[spam-gate] could not mint unsubscribe token", e);
      }

      const content = buildSpamIncidentEmail({
        campaignId: row.campaign_id,
        campaignName: String(campaign?.name ?? ""),
        stats: { finalized: Number(incident?.finalized ?? 0), spam: Number(incident?.spam ?? 0) },
        paused: incident?.paused !== false,
        kind: incident?.kind === "feedback_timeout" ? "feedback_timeout" : "spam",
        baseUrl: publicBaseUrl(),
      });
      const payload = {
        message_id: incidentIdempotencyKey(row.campaign_id),
        to: recipient,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject: content.subject,
        html: content.html,
        text: content.text,
        purpose: "transactional",
        label: "campaign-spam-incident",
        idempotency_key: incidentIdempotencyKey(row.campaign_id),
        ...(unsubscribeToken ? { unsubscribe_token: unsubscribeToken } : {}),
        queued_at: new Date().toISOString(),
        site_name: SITE_NAME,
      };

      // Visibility: "pending" first; "queued" only after the queue accepts
      // it — never claimed as delivered.
      await logEmail(db, row.campaign_id, recipient, "pending");
      const { data: msgId, error: enqErr } = await db.rpc("spam_gate_outbox_enqueue", {
        _outbox_id: row.id, _payload: payload,
      });
      if (enqErr || msgId == null) {
        const message = String(enqErr?.message ?? "enqueue skipped (already handled)");
        // Atomic mark keeps the row pending with backoff; the SQL wrapper
        // rolls back the pgmq.send together with the status flip on failure.
        await markOutbox(db, row.id, "pending", message, 300);
        await logEmail(db, row.campaign_id, recipient, "failed", message);
        result.stillPending += 1;
        continue;
      }
      await logEmail(db, row.campaign_id, recipient, "queued");
      result.enqueued += 1;
    } catch (e: any) {
      console.error("[spam-gate] outbox row failed", row.id, e?.message ?? e);
      result.stillPending += 1;
    }
  }
  return result;
}
