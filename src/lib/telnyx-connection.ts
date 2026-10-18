// Non-secret connection identifiers. Credentials remain server-only secrets.
export const SECONDARY_WORKSPACE_ID = "8938c56c-1545-4221-9d94-c7a68b51613e";
export const SECONDARY_PROFILE_ID = "4001a150-a55c-460f-ae5d-02acca3f97a7";
export const SECONDARY_ACTIVATED_AT = "2026-10-18T20:56:54Z";

/**
 * From this moment every workspace's international (non +1) traffic uses the
 * additional connection, while US/Canada stays paused. Campaigns created
 * before it never restart automatically.
 */
export const INTERNATIONAL_FAILOVER_AT = "2026-10-18T21:30:00Z";

export const NANP_PAUSED_MESSAGE =
  "Sending to the USA and Canada is temporarily paused. Other countries are available.";

export function isNanpNumber(to: string | null | undefined): boolean {
  return String(to ?? "").trim().startsWith("+1");
}

export function secondaryCampaignMaySend(_accountId: string, createdAt: string): boolean {
  return Date.parse(createdAt) >= Date.parse(INTERNATIONAL_FAILOVER_AT) ||
    (_accountId === SECONDARY_WORKSPACE_ID && Date.parse(createdAt) >= Date.parse(SECONDARY_ACTIVATED_AT));
}

export function usesSecondaryConnection(profileId: string | null | undefined): boolean {
  return profileId === SECONDARY_PROFILE_ID;
}

/**
 * Picks the connection for one outbound message. International messages go
 * through the additional connection with the tenant's own sender name; a
 * phone-number sender from the original connection cannot be moved.
 */
export function routeOutbound(opts: { to: string; from?: string; messagingProfileId?: string }):
  | { ok: true; from?: string; messagingProfileId?: string }
  | { ok: false; error: string } {
  if (isNanpNumber(opts.to)) return { ok: false, error: NANP_PAUSED_MESSAGE };
  const from = opts.from?.trim();
  if (!from || from.startsWith("+")) {
    return { ok: false, error: "No approved sender name is available for this country yet." };
  }
  return { ok: true, from, messagingProfileId: SECONDARY_PROFILE_ID };
}
