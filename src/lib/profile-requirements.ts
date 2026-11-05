/**
 * Single source of truth for the business-profile details a tenant must supply
 * before the dashboard opens.
 *
 * Team size is optional (owner decision 2026-11-05): it is still collected when
 * the business offers it, but leaving it blank must never block onboarding.
 */
export const REQUIRED_PROFILE_FIELDS = [
  "legal_business_name",
  "business_address",
  "website_url",
  "contact_email",
  "phone",
  "industry",
] as const;

export type ProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export type ProfileSource = Partial<Record<ProfileField, string | null>> & {
  onboarding_status?: string | null;
};

/** First required field with no value, or null when every required detail is present. */
export function missingProfileField(data: ProfileSource): ProfileField | null {
  for (const field of REQUIRED_PROFILE_FIELDS) {
    const value = data[field];
    if (typeof value !== "string" || !value.trim()) return field;
  }
  return null;
}

/** An already-active business is never sent back through the profile form. */
export function isProfileComplete(account: ProfileSource | null | undefined): boolean {
  if (!account) return false;
  if (account.onboarding_status === "active") return true;
  return missingProfileField(account) === null;
}

export function requiredFieldMessage(field: ProfileField): string {
  return `${field.replace(/_/g, " ")} is required`;
}
