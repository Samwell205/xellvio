// Pure rules for pausing dispatch when the funded carrier account can't pay.
// Sending into a suspended/unfunded account returns 30002/20003 rejections that
// lower the carrier health score, so we hold sending instead and keep the
// recipients queued (already-paid rows are never charged twice).

export const FUNDS_HOLD_MS = 10 * 60 * 1000;

const FUNDS_CODES = new Set(["30002", "20003", "20005"]);

/** True when a send failure means the carrier account itself can't send. */
export function isCarrierFundsError(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = String(code).replace(/^TW/i, "");
  return FUNDS_CODES.has(c);
}

/** Should this dispatch tick hold all sending? Unknown balance never holds. */
export function carrierFundsHeld(args: {
  balanceOk: boolean;
  balance: number;
  buffer: number;
  heldAtMs: number | null;
  nowMs: number;
}): boolean {
  if (args.heldAtMs != null && Number.isFinite(args.heldAtMs) && args.nowMs - args.heldAtMs < FUNDS_HOLD_MS) {
    // A recent rejection holds until the window passes, unless the balance is
    // now confirmed healthy (owner topped up) — then resume right away.
    if (!(args.balanceOk && args.balance > args.buffer)) return true;
    return false;
  }
  return args.balanceOk && args.balance <= args.buffer;
}
