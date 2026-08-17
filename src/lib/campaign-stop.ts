/**
 * Marker written to `campaigns.paused_reason` when a user stops an in-flight
 * campaign but wants it to finish as "Sent" with the report untouched.
 *
 * The dispatcher checks for this marker before reviving a `sent` campaign that
 * still has unplanned audience members, so a stopped campaign stays stopped.
 */
export const STOPPED_AS_SENT = "Stopped by user";

export function isStoppedAsSent(campaign: { status?: string | null; paused_reason?: string | null } | null | undefined): boolean {
  return campaign?.status === "sent" && campaign?.paused_reason === STOPPED_AS_SENT;
}
