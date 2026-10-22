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

/** Original sending account, used for any sender still pointing at the temporary one. */
export const ORIGINAL_PROFILE_ID = "40019f2a-14c7-4447-8b7b-d4cb04511b5a";

/**
 * Original routing restored: each message uses the tenant's own sender and profile.
 * The temporary connection must never send again (owner decision 2026-10-22), so a
 * sender still pointing at it is sent on the original account instead.
 */
export function routeOutbound(opts: { to: string; from?: string; messagingProfileId?: string }):
  | { ok: true; from?: string; messagingProfileId?: string }
  | { ok: false; error: string } {
  const profile = usesSecondaryConnection(opts.messagingProfileId) ? ORIGINAL_PROFILE_ID : opts.messagingProfileId;
  return { ok: true, from: opts.from, messagingProfileId: profile };
}
