/**
 * Carrier spam-rejection gate for campaign dispatch (owner policy,
 * 2026-10-22 — supersedes the earlier "never auto-pause on 40002" rule).
 *
 * Newly launched campaigns are enrolled in persistent monitoring (see
 * db-proposals/20261022-campaign-spam-monitor.sql). Campaigns with more than
 * 25 recipients release at most 25 initial carrier submissions, then wait for
 * finalized carrier receipts. Once at least 20 distinct finalized results
 * exist, the remaining sends are paused when 20% or more were refused with
 * carrier spam code 40002, and the tenant is notified once (durable incident
 * + operational email via a durable outbox). Unknown or missing feedback
 * never counts as spam: at the bounded wait timeout the remainder stays
 * stopped with a truthful "carrier feedback unavailable" reason.
 *
 * This module is pure/shared (safe for the browser bundle). Database work
 * lives in carrier-spam-guard.server.ts; all coordination state lives in the
 * campaign_spam_* tables and is mutated only by the service-role-only SQL
 * functions in the migration.
 */

/** The initial-submission cap applies only to campaigns with MORE than 25 recipients. */
export const SPAM_GATE_MIN_RECIPIENTS = 26;
/** Total initial carrier submissions a capped campaign may make before waiting. */
export const SPAM_GATE_INITIAL_SUBMISSIONS = 25;
/** Minimum distinct finalized receipts before a spam-ratio decision. */
export const SPAM_GATE_MIN_FINALIZED = 20;
/** Carrier spam-filter refusal code. 40001 (landline) and 40012 (invalid)
 * are recipient-data failures and never count here. */
export const SPAM_GATE_SPAM_CODE = "40002";
/** Pause when spam refusals reach this share of distinct finalized results. */
export const SPAM_GATE_SPAM_RATIO = 0.2;
/** Bounded wait for carrier feedback before stopping with "unavailable". */
export const SPAM_GATE_FEEDBACK_WAIT_MS = 10 * 60 * 1000;
/** After a healthy initial burst, at most this many sends may be awaiting
 * final feedback at once — parallelism without blasting the whole audience. */
export const SPAM_GATE_OUTSTANDING_ALLOWANCE = 250;

/** Monitor states stored on campaign_spam_monitors.state. */
export type SpamGateMonitorState =
  | "monitoring" | "released" | "paused_spam" | "paused_timeout" | "concluded";

/** Pause reasons. Deliberately distinct from the account-hold reasons matched
 * by HOLD_PAUSE_FILTER ("Tenant sending suspended" / "Sending suspended:*")
 * so lifting an account hold NEVER auto-resumes these campaigns. These exact
 * strings are also written by spam_gate_do_pause in the migration — the SQL
 * contract test keeps them in sync. */
export const SPAM_PAUSE_REASON =
  "Paused: mobile carriers rejected a high share of these texts as spam. Remaining sends are stopped.";
export const FEEDBACK_TIMEOUT_REASON =
  "Paused: carrier feedback unavailable. Remaining sends stayed stopped.";

export function isSpamGatePauseReason(reason: string | null | undefined): boolean {
  return reason === SPAM_PAUSE_REASON;
}
export function isFeedbackTimeoutReason(reason: string | null | undefined): boolean {
  return reason === FEEDBACK_TIMEOUT_REASON;
}
export function isSpamGateReason(reason: string | null | undefined): boolean {
  return isSpamGatePauseReason(reason) || isFeedbackTimeoutReason(reason);
}

// ── Receipt evaluation ───────────────────────────────────────────────────────

export type FinalizedReceipt = {
  provider_message_id?: string | null;
  message_id?: string | null;
  error_code?: string | null;
  provider_status?: string | null;
};

export type SpamGateStats = { finalized: number; spam: number };

/**
 * Count DISTINCT finalized carrier receipts. Replayed/duplicate webhooks for
 * the same provider message count once. A receipt is a spam refusal when its
 * stored finalized error code is 40002 — even if the message row was
 * optimistically marked "sent"; the immutable receipt is the evidence, not
 * messages.status. The production counters live on campaign_spam_monitors
 * (maintained transactionally by spam_gate_record_receipt); this pure model
 * is what the tests evaluate against.
 */
export function summarizeFinalizedReceipts(rows: FinalizedReceipt[]): SpamGateStats {
  const seen = new Set<string>();
  let spam = 0;
  for (const r of rows) {
    const key = r.provider_message_id
      ? `p:${r.provider_message_id}`
      : r.message_id
        ? `m:${r.message_id}`
        : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (String(r.error_code ?? "") === SPAM_GATE_SPAM_CODE) spam += 1;
  }
  return { finalized: seen.size, spam };
}

export type SpamGateDecision =
  | { decision: "wait"; stats: SpamGateStats }
  | { decision: "pause_spam"; stats: SpamGateStats }
  | { decision: "pass"; stats: SpamGateStats };

/**
 * Boundary rule: at exactly 20 finalized results, 4 spam refusals (20%)
 * pauses; 3 (15%) passes. Below 20 finalized results there is no decision —
 * keep waiting (never treat unknown as spam).
 */
export function evaluateSpamGate(stats: SpamGateStats): SpamGateDecision {
  if (stats.finalized < SPAM_GATE_MIN_FINALIZED) return { decision: "wait", stats };
  if (stats.spam >= Math.ceil(stats.finalized * SPAM_GATE_SPAM_RATIO)) {
    return { decision: "pause_spam", stats };
  }
  return { decision: "pass", stats };
}

/** Resolve the tenant contact address the way the migration does:
 * TRIM(contact_email), falling back to TRIM(email); empty strings and
 * whitespace-only values never win over a usable fallback. */
export function resolveIncidentRecipient(account: {
  contact_email?: string | null;
  email?: string | null;
} | null | undefined): string | null {
  const contact = String(account?.contact_email ?? "").trim().toLowerCase();
  if (contact) return contact;
  const login = String(account?.email ?? "").trim().toLowerCase();
  return login || null;
}

// ── Tenant-facing incident email ─────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type SpamIncidentEmailInput = {
  campaignId: string;
  campaignName: string;
  stats: SpamGateStats;
  /** true: remaining sends were stopped. false: everything was already
   * submitted before the results arrived — say so honestly. */
  paused: boolean;
  /** "spam" | "feedback_timeout" */
  kind: "spam" | "feedback_timeout";
  baseUrl: string;
};

export function buildSpamIncidentEmail(input: SpamIncidentEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const name = input.campaignName.trim() || "Untitled campaign";
  const reportUrl = `${input.baseUrl}/app/campaigns/${encodeURIComponent(input.campaignId)}`;
  const supportUrl = `${input.baseUrl}/app/support`;
  const pct = input.stats.finalized > 0
    ? Math.round((input.stats.spam / input.stats.finalized) * 100)
    : 0;

  const headline =
    input.kind === "feedback_timeout"
      ? "We stopped the remaining sends on your campaign"
      : input.paused
        ? "We paused your campaign after carrier spam rejections"
        : "Carrier spam rejections on your campaign";

  const plain =
    input.kind === "feedback_timeout"
      ? `The phone companies did not return delivery results for "${name}" in time, so the remaining messages were left unsent rather than released blindly.`
      : input.paused
        ? `Of the first ${input.stats.finalized} texts with a final carrier result on "${name}", ${input.stats.spam} (${pct}%) were rejected by the recipients' mobile carriers as suspected spam, so the remaining messages were stopped.`
        : `Of ${input.stats.finalized} texts with a final carrier result on "${name}", ${input.stats.spam} (${pct}%) were rejected by the recipients' mobile carriers as suspected spam. All messages in this campaign had already been handed to the carriers, so there was nothing left to stop.`;

  const caveat = input.paused
    ? "Messages already handed to the carriers before the pause can still complete, and those sends are still charged. The remaining, unsent messages are not sent and not charged."
    : "All submitted sends are final and charged as usual.";

  const nextSteps =
    input.kind === "feedback_timeout"
      ? "This is usually temporary. Open the campaign report to see the latest results, or contact support and we can check the carrier responses with you."
      : "Carrier spam filters look at wording, links and sending patterns. Review the message wording and your recipient list, and see the full per-recipient results in the campaign report. If you believe the rejections are wrong, contact support and we'll review them with you.";

  const subject =
    input.kind === "feedback_timeout"
      ? `Sends paused on "${name}" — carrier feedback unavailable`
      : input.paused
        ? `Campaign "${name}" paused after carrier spam rejections`
        : `Carrier spam rejections on "${name}"`;

  const html = `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="font-size:20px;color:#111827;">${headline}</h1>
    <p style="font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(plain)}</p>
    <p style="font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(caveat)}</p>
    <p style="font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(nextSteps)}</p>
    <p style="margin:24px 0;">
      <a href="${reportUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:6px;">Open campaign report</a>
    </p>
    <p style="font-size:13px;color:#6b7280;">Need help? <a href="${supportUrl}" style="color:#111827;">Contact support</a>.</p>
  </div>
</body></html>`;

  const text = [
    headline,
    "",
    plain,
    "",
    caveat,
    "",
    nextSteps,
    "",
    `Campaign report: ${reportUrl}`,
    `Support: ${supportUrl}`,
  ].join("\n");

  return { subject, html, text };
}
