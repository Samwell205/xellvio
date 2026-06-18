// Match an E.164 phone to a country_code using longest dial_prefix match.
export type DialEntry = { country_code: string; dial_prefix: string };

export function countryFromPhone(phone: string, rates: DialEntry[]): string | null {
  if (!phone) return null;
  const normalized = phone.trim();
  if (!normalized.startsWith("+")) return null;
  // Sort prefixes longest first so '+1876' wins over '+1' if both present.
  const sorted = [...rates].sort((a, b) => b.dial_prefix.length - a.dial_prefix.length);
  for (const r of sorted) {
    if (normalized.startsWith(r.dial_prefix)) return r.country_code;
  }
  return null;
}
