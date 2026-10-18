// Non-secret connection identifiers. Credentials remain server-only secrets.
export const SECONDARY_WORKSPACE_ID = "8938c56c-1545-4221-9d94-c7a68b51613e";
export const SECONDARY_PROFILE_ID = "4001a150-a55c-460f-ae5d-02acca3f97a7";

export function usesSecondaryConnection(profileId: string | null | undefined): boolean {
  return profileId === SECONDARY_PROFILE_ID;
}