import Papa from "papaparse";
import { getCountries } from "libphonenumber-js";
import { detectContactColumns } from "./contact-file-columns";

/** Country must come from the user for local numbers, never a guessed dialling region. */
export function uploadNeedsCountry(content: string): boolean {
  const parsed = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  const detected = detectContactColumns(parsed.data);
  const index = detected?.phoneIndex ?? 0;
  return (detected?.hasHeader ? parsed.data.slice(1) : parsed.data).some(row => {
    const phone = row[index]?.trim() ?? "";
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
