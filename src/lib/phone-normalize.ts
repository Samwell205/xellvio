import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type NormalizeResult = { e164: string; country: string } | { error: string };

// Cheap dial-prefix → ISO2 map for the fast path only (no library call).
const FAST_PREFIX: Array<[string, string]> = [
  ["+1", "US"],
  ["+44", "GB"],
  ["+234", "NG"],
  ["+91", "IN"],
  ["+49", "DE"],
  ["+33", "FR"],
  ["+45", "DK"],
  ["+27", "ZA"],
  ["+254", "KE"],
  ["+233", "GH"],
  ["+61", "AU"],
  ["+971", "AE"],
  ["+965", "KW"],
  ["+966", "SA"],
];

function fastCountry(e164: string): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const [prefix, cc] of FAST_PREFIX) {
    if (e164.startsWith(prefix) && prefix.length > bestLen) { best = cc; bestLen = prefix.length; }
  }
  return best;
}

/**
 * Fast phone normalizer for bulk CSV imports.
 * Handles the overwhelmingly common cases (already E.164, US/CA 10-11 digit
 * local numbers) with plain string logic, and only falls back to
 * libphonenumber for ambiguous input.
 */
export function normalizePhone(
  raw: string,
  opts: { rowCountry?: string; defaultCountry?: string } = {},
): NormalizeResult {
  const input = (raw ?? "").trim();
  if (!input) return { error: "Missing phone" };

  const plus = input.startsWith("+") || input.startsWith("00");
  const digits = input.replace(/\D/g, "");
  if (!digits) return { error: `Invalid phone "${input}"` };

  const rowCc = (opts.rowCountry ?? "").toUpperCase().slice(0, 2);
  const defCc = (opts.defaultCountry ?? "").toUpperCase().slice(0, 2);

  // --- fast path 1: already international ---
  if (plus) {
    const d = input.startsWith("00") ? digits.replace(/^00/, "") : digits;
    if (d.length >= 8 && d.length <= 15) {
      const e164 = "+" + d;
      const cc = fastCountry(e164);
      if (cc) return { e164, country: cc };
    }
  }

  // --- fast path 2: NANP local numbers (US/CA default) ---
  const nanpDefault = !rowCc || rowCc === "US" || rowCc === "CA";
  const effNanp = nanpDefault && (defCc === "US" || defCc === "CA" || rowCc === "US" || rowCc === "CA");
  if (!plus && effNanp) {
    if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      return { e164: "+1" + digits, country: rowCc || defCc || "US" };
    }
    if (digits.length === 11 && digits.startsWith("1") && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits.slice(1))) {
      return { e164: "+" + digits, country: rowCc || defCc || "US" };
    }
  }

  // --- fallback: full library parse, limited candidate set ---
  const candidates: Array<{ value: string; country?: CountryCode }> = [];
  if (plus) candidates.push({ value: "+" + (input.startsWith("00") ? digits.replace(/^00/, "") : digits) });
  else if (digits.length >= 11) candidates.push({ value: "+" + digits });
  if (rowCc) candidates.push({ value: input, country: rowCc as CountryCode });
  if (defCc && defCc !== rowCc) candidates.push({ value: input, country: defCc as CountryCode });

  for (const c of candidates) {
    const p = parsePhoneNumberFromString(c.value, c.country);
    if (p?.isValid()) return { e164: p.number, country: p.country ?? (rowCc || defCc || "") };
  }
  return { error: `Invalid phone "${input}"` };
}
