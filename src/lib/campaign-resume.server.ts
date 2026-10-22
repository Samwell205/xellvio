/**
 * Strict, deterministic "check and resume" for one explicit paused campaign.
 * Shared by the admin campaign report and the Support copilot. Never picks a
 * different campaign, never calls the carrier, never touches recipients or
 * balances: success only flips the exact row back into the normal dispatcher
 * queue (opt-outs, charging and per-send checks still apply there).
 */

export type ResumeOutcome =
  | { ok: true; status: "sending"; message: string }
  | { ok: false; code: ResumeRefusal; message: string };

export type ResumeRefusal =
  | "not_found" | "wrong_account" | "not_resumable" | "read_failed"
  | "account_inactive" | "sending_hold" | "screen_blocked" | "screen_held"
  | "screen_unavailable" | "changed" | "carrier_spam_hold";

/** Only these paused states may be resumed. Cancelled, blocked_content and
 * final states (sent/failed/completed) are always refused. */
export const RESUMABLE_STATUSES = ["paused", "paused_by_user"] as const;
export function isResumableStatus(s: string | null | undefined): boolean {
  return !!s && (RESUMABLE_STATUSES as readonly string[]).includes(s);
}

type ScreenFn = (text: string, accountId: string, opts: any) => Promise<{ action: string; blockedReasons?: string[] }>;

async function accountGate(db: any, accountId: string): Promise<ResumeOutcome | null> {
  const { data: acct, error } = await db.from("accounts")
    .select("id, onboarding_status, sending_suspended_at").eq("id", accountId).maybeSingle();
  if (error || !acct) return { ok: false, code: "read_failed", message: "Could not read the account, so the campaign stays paused." };
  if (acct.onboarding_status !== "active") return { ok: false, code: "account_inactive", message: `The account is not active (${acct.onboarding_status ?? "unknown"}), so the campaign stays paused.` };
  if (acct.sending_suspended_at) return { ok: false, code: "sending_hold", message: "The account's sending is on hold. Lift the hold first." };
  return null;
}

export async function checkedResumeCampaign(
  db: any,
  input: { campaignId: string; expectedAccountId: string },
  screen?: ScreenFn,
): Promise<ResumeOutcome> {
  const { data: live, error } = await db.from("campaigns")
    .select("id, account_id, status, message_body, name, paused_reason").eq("id", input.campaignId).maybeSingle();
  if (error) return { ok: false, code: "read_failed", message: "Could not read this campaign, so it stays paused." };
  if (!live) return { ok: false, code: "not_found", message: "Campaign not found." };
  if (live.account_id !== input.expectedAccountId) return { ok: false, code: "wrong_account", message: "That campaign doesn't belong to this account." };
  if (!isResumableStatus(live.status)) return { ok: false, code: "not_resumable", message: `This campaign can't be resumed from "${live.status}".` };
  // A carrier spam-gate hold is active on this campaign. Resume is a separate
  // deliberate decision and must not simply bypass the same active hold —
  // lifting an account hold never resumes these either (see HOLD_PAUSE_FILTER).
  const { isSpamGatePauseReason, isFeedbackTimeoutReason, evaluateSpamGate } = await import("./carrier-spam-guard");
  if (isSpamGatePauseReason(live.paused_reason)) {
    // An active 40002 spam condition is never bypassed.
    return { ok: false, code: "carrier_spam_hold", message: "This campaign was stopped because carriers rejected many of its texts as spam. Review the campaign report and contact support before resuming." };
  }
  if (isFeedbackTimeoutReason(live.paused_reason)) {
    // Feedback-timeout hold: support a deliberate checked reevaluation now
    // that current feedback may have arrived. The active spam condition is
    // still never bypassed, and insufficient/unknown feedback still refuses.
    const { spamGateState } = await import("./carrier-spam-guard.server");
    const st = await spamGateState(db, live.id);
    if (!st) return { ok: false, code: "screen_unavailable", message: "Carrier feedback could not be read right now, so the campaign stays paused. Try again shortly." };
    if (!st.enrolled) return { ok: false, code: "carrier_spam_hold", message: "This campaign is not monitored, so its carrier feedback hold cannot be reevaluated here. Contact support." };
    const verdict = evaluateSpamGate({ finalized: st.finalized, spam: st.spam });
    if (verdict.decision === "pause_spam") {
      return { ok: false, code: "carrier_spam_hold", message: `Carrier feedback has arrived and ${st.spam} of ${st.finalized} final results were rejected as spam, so this campaign stays paused.` };
    }
    // This is an explicit manual resume of a legacy feedback timeout. Missing
    // feedback no longer delays it; fresh screening and the atomic final check
    // below still refuse current content/account changes or confirmed spam.
  }
  if (typeof live.message_body !== "string" || !live.message_body.trim()) {
    return { ok: false, code: "read_failed", message: "Could not read this campaign's message, so it stays paused." };
  }

  const before = await accountGate(db, live.account_id);
  if (before) return before;

  let result: { action: string; blockedReasons?: string[] };
  try {
    const fn = screen ?? (await import("./content-screening.server")).screenMessageContent;
    result = await fn(live.message_body, live.account_id, { campaignId: live.id, context: "campaign_resume", skipReviewQueue: true });
  } catch {
    return { ok: false, code: "screen_unavailable", message: "The content check is unavailable right now, so the campaign stays paused. Try again shortly." };
  }
  const reason = result?.blockedReasons?.[0] ?? "";
  if (result?.action === "blocked") return { ok: false, code: "screen_blocked", message: `Content check blocked this message. ${reason}`.trim() };
  if (result?.action === "held_for_review") return { ok: false, code: "screen_held", message: `Content check flagged this message for review. ${reason}`.trim() };
  if (result?.action !== "passed") return { ok: false, code: "screen_unavailable", message: "The content check gave no clear result, so the campaign stays paused." };

  const after = await accountGate(db, live.account_id);
  if (after) return after;

  if (isFeedbackTimeoutReason(live.paused_reason)) {
    // Reevaluate after screening under the same campaign/monitor locks used
    // by final receipts. This resets the monitor and campaign together, and
    // refuses a late spam result or an intervening content/account change.
    const { data: resumed, error: resumeError } = await db.rpc("spam_gate_resume_timeout", {
      _campaign_id: live.id,
      _account_id: live.account_id,
      _body: live.message_body,
      _status: live.status,
    });
    if (resumeError || resumed !== true) {
      return { ok: false, code: "changed", message: "The campaign or carrier feedback changed before it could resume. It stays paused; refresh and review the latest results." };
    }
    return { ok: true, status: "sending", message: `Campaign "${live.name ?? "campaign"}" passed the checks and is back in the send queue.` };
  }

  const { data: updated, error: uErr } = await db.from("campaigns")
    .update({ status: "sending", paused_reason: null, paused_at: null })
    .eq("id", live.id).eq("account_id", live.account_id).eq("status", live.status).eq("message_body", live.message_body)
    .select("id");
  if (uErr || !Array.isArray(updated) || updated.length !== 1) {
    return { ok: false, code: "changed", message: "The campaign changed before it could resume, so it stays paused. Refresh and try again." };
  }
  return { ok: true, status: "sending", message: `Campaign "${live.name ?? "campaign"}" passed the content check and is back in the send queue.` };
}
