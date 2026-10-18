// Non-secret connection identifiers. Credentials remain server-only secrets.
export const SECONDARY_WORKSPACE_ID = "8938c56c-1545-4221-9d94-c7a68b51613e";
export const SECONDARY_PROFILE_ID = "4001a150-a55c-460f-ae5d-02acca3f97a7";
export const SECONDARY_ACTIVATED_AT = "2026-10-18T20:56:54Z";

export function secondaryCampaignMaySend(accountId: string, createdAt: string): boolean {
  return accountId !== SECONDARY_WORKSPACE_ID || Date.parse(createdAt) >= Date.parse(SECONDARY_ACTIVATED_AT);
}

export function usesSecondaryConnection(profileId: string | null | undefined): boolean {
  return profileId === SECONDARY_PROFILE_ID;
}