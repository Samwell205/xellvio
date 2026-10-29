// Owner rule: no customer reply → reminder at 3h, second reminder at 6h, auto-close at 9h.
export const FOLLOWUP_STEP_MS = 3 * 3600_000;
export const CLOSE_AFTER_MS = 3 * FOLLOWUP_STEP_MS;

export type FollowupAction = "none" | "reminder1" | "reminder2" | "close";

/** stamp = when support last replied/resolved; reminderAt = last reminder sent (null if none). */
export function followupAction(stampMs: number, reminderAtMs: number | null, nowMs: number): FollowupAction {
  const since = nowMs - stampMs;
  if (since >= CLOSE_AFTER_MS) return "close";
  const reminded = reminderAtMs != null && reminderAtMs >= stampMs;
  if (since >= 2 * FOLLOWUP_STEP_MS) {
    // Second reminder only if the last reminder was the first one (sent before the 6h mark).
    if (!reminded) return "reminder1";
    return reminderAtMs! < stampMs + 2 * FOLLOWUP_STEP_MS ? "reminder2" : "none";
  }
  if (since >= FOLLOWUP_STEP_MS && !reminded) return "reminder1";
  return "none";
}
