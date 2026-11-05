// Match an E.164 phone to a country_code using longest dial_prefix match.
export type DialEntry = { country_code: string; dial_prefix: string };

// Puerto Rico shares +1 with the US but is priced separately.
const PR_PREFIXES = ["+1787", "+1939"];

export function isPuertoRicoPhone(phone: string | null | undefined): boolean {
  const p = String(phone ?? "").trim();
  return PR_PREFIXES.some((x) => p.startsWith(x));
}

export function countryFromPhone(phone: string, rates: DialEntry[]): string | null {
  if (!phone) return null;
  const normalized = phone.trim();
  if (!normalized.startsWith("+")) return null;
  if (isPuertoRicoPhone(normalized) && rates.some((r) => r.country_code === "PR")) return "PR";
  // Sort prefixes longest first so '+1876' wins over '+1' if both present.
  const sorted = [...rates].sort((a, b) => b.dial_prefix.length - a.dial_prefix.length);
  for (const r of sorted) {
    if (normalized.startsWith(r.dial_prefix)) return r.country_code;
  }
  return null;
}

/** Stored contact country wins, except +1 787/939 numbers saved as US are Puerto Rico. */
export function resolveRecipientCountry(
  stored: string | null | undefined,
  phone: string,
  rates: DialEntry[],
): string | null {
  const s = (stored ?? "").toUpperCase();
  if ((!s || s === "US") && isPuertoRicoPhone(phone) && rates.some((r) => r.country_code === "PR")) return "PR";
  return s || countryFromPhone(phone, rates);
}
