// Classify the exact carrier outcome only. A rejected request cannot establish
// a region-wide permission block for unrelated recipients or accounts.
const GEO_CODES = new Set(["21408"]);

export function isGeoPermissionError(code: string | null | undefined): boolean {
  if (!code) return false;
  return GEO_CODES.has(String(code).replace(/^TW/i, ""));
}

