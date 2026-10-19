// Non-secret connection identifiers. Credentials remain server-only secrets.
export const SECONDARY_WORKSPACE_ID = "8938c56c-1545-4221-9d94-c7a68b51613e";
export const SECONDARY_PROFILE_ID = "4001a150-a55c-460f-ae5d-02acca3f97a7";
export const SECONDARY_ACTIVATED_AT = "2026-10-18T20:56:54Z";

/**
 * Temporary window when the original connection was blocked and every
 * workspace's international (non +1) traffic used the additional connection.
 * Kept only so delivery lookups for messages sent in that window still hit
 * the right connection. All sending is back on the original connection.
 */
export const INTERNATIONAL_FAILOVER_AT = "2026-10-18T21:30:00Z";
export const INTERNATIONAL_FAILOVER_ENDED_AT = "2026-10-19T19:45:00Z";

export function isNanpNumber(to: string | null | undefined): boolean {
  return String(to ?? "").trim().startsWith("+1");
}

/** True when a message was sent through the additional connection during the failover window. */
export function sentDuringFailover(sentAtMs: number, to: string | null | undefined): boolean {
  return sentAtMs >= Date.parse(INTERNATIONAL_FAILOVER_AT) &&
    sentAtMs < Date.parse(INTERNATIONAL_FAILOVER_ENDED_AT) &&
    !isNanpNumber(to);
}

/** The original connection is restored: every campaign may send again. */
export function secondaryCampaignMaySend(_accountId: string, _createdAt: string): boolean {
  return true;
}

export function usesSecondaryConnection(profileId: string | null | undefined): boolean {
  return profileId === SECONDARY_PROFILE_ID;
}

/** Original routing restored: each message uses the tenant's own sender and profile. */
export function routeOutbound(opts: { to: string; from?: string; messagingProfileId?: string }):
  | { ok: true; from?: string; messagingProfileId?: string }
  | { ok: false; error: string } {
  return { ok: true, from: opts.from, messagingProfileId: opts.messagingProfileId };
}
