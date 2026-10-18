import { usesSecondaryConnection } from "./telnyx-connection";

// An untrusted profile only selects the key; signature verification is still mandatory.
export function webhookPublicKey(raw: string): string | undefined {
  try {
    const profileId = JSON.parse(raw)?.data?.payload?.messaging_profile_id;
    return usesSecondaryConnection(profileId)
      ? process.env.TELNYX_SECONDARY_PUBLIC_KEY
      : process.env.TELNYX_PUBLIC_KEY;
  } catch {
    return undefined;
  }
}