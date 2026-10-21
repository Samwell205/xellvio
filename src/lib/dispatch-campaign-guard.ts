/**
 * Guards that keep stale or overlapping dispatcher slots from acting on a
 * campaign snapshot that is no longer current. Every write here is
 * conditional on the campaign's *current* status in the database, and initial
 * screening is claimed once per campaign + content revision through the
 * existing atomic `try_acquire_dispatch_lock` primitive (INSERT … ON CONFLICT
 * DO NOTHING), never an in-memory flag.
 */

/** Statuses the dispatcher may actively work on. Anything else is stopped,
 * blocked, held or final and must be left exactly as it is. */
export const DISPATCHABLE_STATUSES = ["queued", "sending", "scheduled"] as const;

export function isDispatchableStatus(status: string | null | undefined): boolean {
  return !!status && (DISPATCHABLE_STATUSES as readonly string[]).includes(status);
}

/** Stable short hash of the message body so an edited revision gets a new claim. */
export function contentRevisionKey(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function screeningClaimName(campaignId: string, body: string): string {
  return `screen:${campaignId}:${contentRevisionKey(body ?? "")}`;
}

/** Re-read the campaign's current status; null when it is gone. */
export async function currentCampaignStatus(db: any, campaignId: string): Promise<string | null> {
  const { data } = await db.from("campaigns").select("status").eq("id", campaignId).maybeSingle();
  return data?.status ?? null;
}

/** Update a campaign only if it is still dispatchable, so a stale slot can
 * never overwrite blocked_content / paused / cancelled / sent. */
export async function updateIfDispatchable(db: any, campaignId: string, patch: Record<string, unknown>) {
  return db.from("campaigns").update(patch).eq("id", campaignId).in("status", [...DISPATCHABLE_STATUSES]);
}

/**
 * Claim the one-time initial screening for this campaign revision.
 * Returns "claimed" for exactly one caller; concurrent/stale callers get
 * "busy" and must not screen (so they cannot add duplicate audit rows that
 * count as repeat abuse). If the lock helper itself is unavailable we still
 * screen ("unguarded") rather than freeze sending.
 */
export async function claimInitialScreening(db: any, campaignId: string, body: string): Promise<"claimed" | "busy" | "unguarded"> {
  const { data, error } = await db.rpc("try_acquire_dispatch_lock", { _name: screeningClaimName(campaignId, body) });
  if (error) return "unguarded";
  return data ? "claimed" : "busy";
}

/**
 * Count distinct blocked violations for the repeat-abuse policy. Campaign
 * rows collapse to one per campaign + content revision (retries/workers of the
 * same submission are one violation); every non-campaign row (test sends,
 * replies) stays its own violation.
 */
export function distinctViolationCount(rows: Array<{ id: string; campaign_id: string | null; message_text: string | null }>): number {
  const keys = new Set<string>();
  for (const r of rows) {
    keys.add(r.campaign_id ? `c:${r.campaign_id}:${contentRevisionKey(r.message_text ?? "")}` : `r:${r.id}`);
  }
  return keys.size;
}
