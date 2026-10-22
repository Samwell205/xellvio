/**
 * Neutralize spreadsheet formula injection: cells that begin with = + - @
 * tab or carriage return are prefixed with a single quote so spreadsheet
 * apps treat them as text instead of executing them.
 */
export function neutralizeCsvCell(value: unknown): string {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Neutralize then quote a CSV cell. */
export function csvCell(value: unknown): string {
  return `"${neutralizeCsvCell(value).replace(/"/g, '""')}"`;
}
