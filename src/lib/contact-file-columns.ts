/** Lenient column detection for uploaded contact files (spreadsheet exports vary a lot). */
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const PHONE_HEADER = /^(phone|phonenumber|phoneno|phonee164|mobile|mobilenumber|mobilephone|cell|cellphone|cellnumber|tel|telephone|number|msisdn|whatsapp|contactnumber|sms)$/;
const PHONEISH_HEADER = /(phone|mobile|cell|tel|msisdn|whatsapp)/;
const looksLikePhone = (v: string) => {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 && /^[\s+()\-.\d]+$/.test(v.trim());
};

export type ContactColumns = { hasHeader: boolean; phoneIndex: number; firstIndex: number; lastIndex: number };

export function detectContactColumns(rows: string[][]): ContactColumns | null {
  const first = rows[0] ?? [];
  const headers = first.map(norm);
  let phoneIndex = headers.findIndex((h) => PHONE_HEADER.test(h));
  if (phoneIndex < 0) phoneIndex = headers.findIndex((h) => PHONEISH_HEADER.test(h));
  const headerLooksLikeData = first.some(looksLikePhone);
  const hasHeader = phoneIndex >= 0 || !headerLooksLikeData;
  if (phoneIndex < 0) {
    // No recognisable heading: pick the column whose values mostly look like phone numbers.
    const sample = rows.slice(hasHeader ? 1 : 0, 201);
    const width = Math.max(0, ...sample.map((r) => r.length));
    let best = -1, bestScore = 0;
    for (let i = 0; i < width; i++) {
      const score = sample.filter((r) => looksLikePhone(r[i] ?? "")).length;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    if (best < 0 || bestScore < Math.max(1, sample.length * 0.5)) return null;
    phoneIndex = best;
  }
  const find = (re: RegExp) => (hasHeader ? headers.findIndex((h) => re.test(h)) : -1);
  return {
    hasHeader,
    phoneIndex,
    firstIndex: find(/^(firstname|first|fname|givenname|name)$/),
    lastIndex: find(/^(lastname|last|lname|surname|familyname)$/),
  };
}
