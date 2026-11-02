import { usesSecondaryConnection, usesInternationalConnection, INTERNATIONAL_PROFILE_ID } from "./telnyx-connection";

// An untrusted profile only selects the candidate order; signature verification
// is still mandatory and every candidate is a trusted sending account's key.
export function webhookPublicKeys(raw: string): string[] {
  const candidates: string[] = [];
  const push = (key?: string) => {
    if (key && !candidates.includes(key)) candidates.push(key);
  };
  try {
    const profileId = JSON.parse(raw)?.data?.payload?.messaging_profile_id;
    if (profileId === INTERNATIONAL_PROFILE_ID) {
      push(process.env.TELNYX_INTERNATIONAL_PUBLIC_KEY);
    } else if (usesSecondaryConnection(profileId)) {
      push(process.env.TELNYX_SECONDARY_PUBLIC_KEY);
    } else {
      push(process.env.TELNYX_PRIMARY_PUBLIC_KEY);
    }
  } catch {
    // Unparseable body still gets all candidates; verification decides.
  }
  push(process.env.TELNYX_PUBLIC_KEY);
  push(process.env.TELNYX_PRIMARY_PUBLIC_KEY);
  push(process.env.TELNYX_INTERNATIONAL_PUBLIC_KEY);
  push(process.env.TELNYX_SECONDARY_PUBLIC_KEY);
  return candidates;
}

export function webhookPublicKey(raw: string): string | undefined {
  return webhookPublicKeys(raw)[0];
}
