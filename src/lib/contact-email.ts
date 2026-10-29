/** Lowercased, trimmed email, or null when the value is not a plausible address. */
export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}
