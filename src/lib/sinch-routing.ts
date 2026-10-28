/** UK numbers (+44, incl. Guernsey/Jersey/Isle of Man) use the second SMS route. MMS stays on the primary route. */
export function isSinchDestination(to: string, opts: { hasMedia?: boolean } = {}): boolean {
  if (opts.hasMedia) return false;
  return /^\+44\d{9,10}$/.test(String(to ?? "").trim());
}

/** Sinch message IDs are 26-char ULIDs; the primary route uses UUIDs. */
export function isSinchMessageId(id: string | null | undefined): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(String(id ?? ""));
}

export function mapSinchStatus(status: string | undefined): "sent" | "delivered" | "delivery_failed" {
  const s = String(status ?? "").toUpperCase();
  if (s === "DELIVERED" || s === "READ") return "delivered";
  if (s === "FAILED" || s === "SWITCHING_CHANNEL") return "delivery_failed";
  return "sent";
}
