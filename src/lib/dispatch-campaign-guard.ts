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
 * Returns "claimed" for exactly one caller. Concurrent/stale callers get
 * "busy"; a coordination failure (RPC error) returns "unavailable". Both must
 * defer with no screening, planning or provider calls — there is no unguarded
 * fallback.
 */
export async function claimInitialScreening(db: any, campaignId: string, body: string): Promise<"claimed" | "busy" | "unavailable"> {
  try {
    const { data, error } = await db.rpc("try_acquire_dispatch_lock", { _name: screeningClaimName(campaignId, body) });
    if (error) return "unavailable";
    return data === true ? "claimed" : "busy";
  } catch {
    return "unavailable";
  }
}

/**
 * After acquiring the claim, reload the live campaign row. Proceed only when
 * it is still dispatchable and its body equals the snapshot the claim was
 * keyed on; otherwise defer so an obsolete body/state is never processed.
 */
export async function reloadClaimedCampaign(db: any, snapshot: { id: string; message_body?: string | null }):
  Promise<{ ok: true; campaign: any } | { ok: false; reason: string }> {
  const { data, error } = await db.from("campaigns").select("*").eq("id", snapshot.id).maybeSingle();
  if (error || !data) return { ok: false, reason: "campaign_reload_failed" };
  if (!isDispatchableStatus(data.status)) return { ok: false, reason: "campaign_not_dispatchable" };
  if ((data.message_body ?? "") !== (snapshot.message_body ?? "")) return { ok: false, reason: "campaign_body_changed" };
  return { ok: true, campaign: data };
}

/**
 * Error path for a failed dispatch tick. Every promotion is conditional on
 * the campaign still being dispatchable, so a campaign that was blocked,
 * paused, cancelled or finalized meanwhile is preserved exactly.
 */
export async function recoverAfterTickError(db: any, campaignId: string, err: unknown): Promise<string> {
  const msg = (err as any)?.message ?? String(err);
  const note = `Temporary send error, retrying: ${msg}`;
  const status = await currentCampaignStatus(db, campaignId);
  if (!isDispatchableStatus(status)) return "preserved";
  const { count: leftover, error: e1 } = await db.from("messages").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId).in("status", ["queued", "sending"]);
  const { count: everPlanned, error: e2 } = await db.from("messages").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (e1 || e2) return "deferred"; // unknown state: change nothing
  if ((leftover ?? 0) > 0) { await updateIfDispatchable(db, campaignId, { status: "sending", paused_reason: note }); return "sending"; }
  if ((everPlanned ?? 0) === 0) { await updateIfDispatchable(db, campaignId, { status: "queued", paused_reason: note }); return "queued"; }
  const { count: handedOff, error: e3 } = await db.from("messages").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId).in("status", ["sent", "delivered", "delivery_unconfirmed", "undelivered"]);
  if (e3) return "deferred";
  const final = (handedOff ?? 0) > 0 ? "sent" : "failed";
  await updateIfDispatchable(db, campaignId, { status: final, paused_reason: msg || "Send failed" });
  return final;
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
