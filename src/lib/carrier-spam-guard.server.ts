/**
 * Server side of the carrier spam-rejection gate (see carrier-spam-guard.ts
 * for the policy). ALL coordination state lives in the campaign_spam_*
 * tables and is mutated only by the service-role-only SQL functions from
 * db-proposals/20261022-campaign-spam-monitor.sql:
 *
 *  - spam_gate_claim is the ONLY claim path: it locks the campaign and
 *    monitor rows, re-checks live status, account hold and confirmed incident
 *    flags, then invokes the existing
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
import { INCIDENT_EMAIL_LABEL, transitionIncidentOutbox, type IncidentEmailState } from "./campaign-incident-email.server";
import {
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
  outstanding: number;
  finalized: number;
  spam: number;
  expectedTotal: number | null;
  waitingSinceMs: number | null;
};

/** Explicit report/manual-resume read only; ordinary dispatch never calls
 * this receipt-state query. Returns null on read error. */
export async function spamGateState(db: any, campaignId: string): Promise<SpamGateState | null> {
  const { data, error } = await db.rpc("spam_gate_state", { _campaign_id: campaignId });
  if (error || !Array.isArray(data)) return null;
  const row = data[0];
  if (!row) {
    return { enrolled: false, state: null, submitted: 0, outstanding: 0, finalized: 0, spam: 0, expectedTotal: null, waitingSinceMs: null };
  }
  const waited = row.waiting_since ? new Date(String(row.waiting_since)).getTime() : null;
  return {
    enrolled: true,
    state: (row.state ?? null) as SpamGateMonitorState | null,
    submitted: Number(row.submitted_count ?? 0),
    outstanding: Number(row.outstanding_count ?? Math.max(0, Number(row.submitted_count ?? 0) - Number(row.finalized_count ?? 0))),
    finalized: Number(row.finalized_count ?? 0),
    spam: Number(row.spam_count ?? 0),
    expectedTotal: row.expected_total == null ? null : Number(row.expected_total),
    waitingSinceMs: Number.isFinite(waited) ? waited : null,
  };
}

/**
 * The ONLY way dispatch claims paid message work. The SQL wrapper checks
 * live campaign status, account hold and confirmed incident flags before
 * invoking the original claim function with its unchanged requested limit.
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

/** Planning-completion metadata for truthful incident copy; no send limit. */
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
  try {
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
  } catch (e: any) {
    // A mid-transaction crash rolls the whole receipt+pause+incident back;
    // the caller defers (webhook redelivery) and nothing is half-applied.
    return { ok: false, error: String(e?.message ?? e) };
  }
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
  status: IncidentEmailState;
  payload?: any;
};

async function logEmail(db: any, campaignId: string, to: string, status: string, errorMessage?: string | null): Promise<void> {
  const { error } = await db.from("email_send_log").insert({
    message_id: incidentIdempotencyKey(campaignId),
    template_name: INCIDENT_EMAIL_LABEL,
    recipient_email: to,
    status,
    ...(errorMessage ? { error_message: String(errorMessage).slice(0, 1000) } : {}),
  });
  if (error) throw new Error("Incident email visibility could not be saved");
}

export type OutboxProcessResult = {
  scanned: number; enqueued: number; sent: number; failedTerminal: number;
  suppressed: number; missing: number; stillPending: number; failed: number;
};

/**
 * Independent, bounded worker: due selection is advisory; enqueue and each
 * transition are protected by SQL row locks and expected-status CAS. "queued"
 * means accepted by the mail queue, while "sent" requires actual send proof.
 */
export async function processSpamGateEmailOutbox(
  db: any, opts: { limit?: number } = {},
): Promise<OutboxProcessResult> {
  const result: OutboxProcessResult = {
    scanned: 0, enqueued: 0, sent: 0, failedTerminal: 0, suppressed: 0,
    missing: 0, stillPending: 0, failed: 0,
  };
  const { data, error } = await db.rpc("spam_gate_outbox_due", { _limit: opts.limit ?? 10 });
  if (error || !Array.isArray(data)) { result.failed = 1; return result; }
  result.scanned = data.length;

  for (const row of data as OutboxRow[]) {
    try {
      if (row.status === "queued") {
        const key = incidentIdempotencyKey(row.campaign_id);
        // Query actual send proof independently: it wins over every older or
        // transient failure, regardless of log pagination/order.
        const { data: sentLog, error: sentError } = await db.from("email_send_log")
          .select("id").eq("message_id", key).eq("status", "sent").limit(1).maybeSingle();
        if (sentError) throw new Error("Incident email send proof could not be read");
        if (sentLog) {
          if (await transitionIncidentOutbox(db, row.id, "queued", "sent", null)) result.sent += 1;
          continue;
        }
        const { data: terminal, error: terminalError } = await db.from("email_send_log")
          .select("status,error_message").eq("message_id", key)
          .in("status", ["dlq", "bounced", "suppressed"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (terminalError) throw new Error("Incident email terminal state could not be read");
        if (terminal) {
          const next = terminal.status === "suppressed" ? "suppressed" : "failed";
          const message = next === "failed"
            ? "Incident email needs manual review: " + String(terminal.error_message ?? terminal.status)
            : "Recipient is on the suppression list";
          if (await transitionIncidentOutbox(db, row.id, "queued", next, message)) {
            if (next === "failed") result.failedTerminal += 1; else result.suppressed += 1;
          }
        } else {
          // Generic "failed" log rows are attempts, not a terminal outcome.
          // Move the next check forward so old queued items cannot starve new notices.
          await transitionIncidentOutbox(db, row.id, "queued", "queued", null, 300);
          result.stillPending += 1;
        }
        continue;
      }
      if (row.status !== "pending") continue;

      const { data: incident, error: incidentError } = await db.from("campaign_spam_incidents")
        .select("kind,paused,finalized,spam,submission_state,submitted_count,remaining_count")
        .eq("campaign_id", row.campaign_id).maybeSingle();
      const { data: campaign, error: campaignError } = await db.from("campaigns")
        .select("name").eq("id", row.campaign_id).maybeSingle();
      const { data: account, error: accountError } = await db.from("accounts")
        .select("email,contact_email").eq("id", row.account_id).maybeSingle();
      if (incidentError || !incident || campaignError || !campaign || accountError) {
        throw new Error("Incident notification details could not be read; retry required");
      }

      const recipient = resolveIncidentRecipient(account);
      if (!recipient) {
        if (await transitionIncidentOutbox(db, row.id, "pending", "missing", "Account has no contact or login email")) result.missing += 1;
        continue;
      }
      const { data: suppressed, error: suppressionError } = await db.from("suppressed_emails")
        .select("email").eq("email", recipient).maybeSingle();
      if (suppressionError) throw new Error("Incident email suppression check is unavailable");
      if (suppressed) {
        if (await transitionIncidentOutbox(db, row.id, "pending", "suppressed", "Recipient is on the suppression list")) {
          await logEmail(db, row.campaign_id, recipient, "suppressed", "Recipient is on the suppression list");
          result.suppressed += 1;
        }
        continue;
      }

      let unsubscribeToken: string | null = null;
      const token = generateToken();
      // Create only if absent. Retried/concurrent incident builds must never
      // rotate a token already used by older unsubscribe links.
      const { error: tokenInsertError } = await db.from("email_unsubscribe_tokens")
        .upsert({ email: recipient, token }, { onConflict: "email", ignoreDuplicates: true });
      if (tokenInsertError) throw new Error("Incident email unsubscribe token could not be saved");
      const { data: tok, error: tokenReadError } = await db.from("email_unsubscribe_tokens")
        .select("token").eq("email", recipient).maybeSingle();
      if (tokenReadError || !tok?.token) throw new Error("Incident email unsubscribe token could not be read");
      unsubscribeToken = tok.token;

      const content = buildSpamIncidentEmail({
        campaignId: row.campaign_id, campaignName: String(campaign.name ?? ""),
        stats: { finalized: Number(incident.finalized), spam: Number(incident.spam) },
        paused: incident.paused === true, submissionState: incident.submission_state,
        kind: incident.kind, baseUrl: publicBaseUrl(),
      });
      const payload = {
        message_id: incidentIdempotencyKey(row.campaign_id),
        incident_outbox_id: row.id,
        to: recipient, from: FROM_ADDRESS, sender_domain: SENDER_DOMAIN,
        subject: content.subject, html: content.html, text: content.text,
        purpose: "transactional", label: INCIDENT_EMAIL_LABEL,
        idempotency_key: incidentIdempotencyKey(row.campaign_id),
        unsubscribe_token: unsubscribeToken, queued_at: new Date().toISOString(), site_name: SITE_NAME,
      };
      await logEmail(db, row.campaign_id, recipient, "pending");
      const { data: msgId, error: enqueueError } = await db.rpc("spam_gate_outbox_enqueue", {
        _outbox_id: row.id, _payload: payload,
      });
      if (enqueueError) {
        // The reply may be lost after commit. CAS pending->pending only adds
        // retry backoff if it truly remains pending; queued/sent cannot rewind.
        await transitionIncidentOutbox(db, row.id, "pending", "pending", String(enqueueError.message ?? "Queue response unavailable"), 300);
        result.stillPending += 1;
        continue;
      }
      if (msgId == null) { result.stillPending += 1; continue; } // another worker already committed it
      await logEmail(db, row.campaign_id, recipient, "queued");
      result.enqueued += 1;
    } catch (e: any) {
      const message = String(e?.message ?? "Incident email deferred");
      try { await transitionIncidentOutbox(db, row.id, row.status, row.status, message, 300); }
      catch { /* Existing durable row remains discoverable; never erase or rewind it. */ }
      result.stillPending += 1;
      result.failed += 1;
    }
  }
  return result;
}
