/**
 * Server-side pricing for custom top-ups. The customer only chooses how many
 * whole dollars to add; the charged price and credited amount are always
 * derived here (1 credit per USD), so a request can't pick its own rate.
 */
export const CUSTOM_TOPUP_MIN_USD = 5;
export const CUSTOM_TOPUP_MAX_USD = 10_000;
export const CREDITS_PER_USD = 1;

export function priceCustomTopUp(raw: unknown): { amountUsd: number; credits: number } {
  const a = Number(raw);
  if (!Number.isFinite(a) || !Number.isInteger(a)) throw new Error("Enter a whole-dollar amount");
  if (a < CUSTOM_TOPUP_MIN_USD) throw new Error(`Minimum is $${CUSTOM_TOPUP_MIN_USD}`);
  if (a > CUSTOM_TOPUP_MAX_USD) throw new Error("Maximum is $10,000");
  return { amountUsd: a, credits: a * CREDITS_PER_USD };
}
