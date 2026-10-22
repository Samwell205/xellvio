import Papa from "papaparse";
import { getCountries } from "libphonenumber-js";

/** Country must come from the user for local numbers, never a guessed dialling region. */
export function uploadNeedsCountry(content: string): boolean {
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });
  const first = parsed.data[0] ?? [];
  const index = first.findIndex(c => /^(phone|phone_number|phone_e164|mobile|telephone|number)$/i.test(c.trim()));
  return (index >= 0 ? parsed.data.slice(1) : parsed.data).some(row => {
    const phone = row[index >= 0 ? index : 0]?.trim() ?? "";
    return phone !== "" && !phone.startsWith("+") && !phone.startsWith("00");
  });
}

export function uploadCountry(answer: string): string | null {
  const normalized = answer.trim().toLowerCase().replace(/[.]/g, "");
  const aliases: Record<string, string> = { uk: "GB", britain: "GB", england: "GB", usa: "US", america: "US" };
  if (aliases[normalized]) return aliases[normalized];
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (const code of getCountries()) {
    if (normalized === code.toLowerCase() || normalized === names.of(code)?.toLowerCase()) return code;
  }
  return null;
}