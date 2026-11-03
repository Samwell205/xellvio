/** Tenant-facing price per carrier phone-number lookup, USD (owner decision 2026-11-03). */
export const LOOKUP_PRICE_PER_NUMBER = 0.01;

/** Cost in cents of checking `count` numbers. Cached results are free. */
export function lookupCostCents(count: number): number {
  return Math.round(count * LOOKUP_PRICE_PER_NUMBER * 100);
}
