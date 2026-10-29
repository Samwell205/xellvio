/** All non-US/Canada destinations (UK included) use the international SMS route. MMS stays on the primary route. */
export function isInfobipDestination(to: string, opts: { hasMedia?: boolean } = {}): boolean {
  if (opts.hasMedia) return false;
  const t = String(to ?? "").trim();
  return /^\+[1-9]\d{7,14}$/.test(t) && !t.startsWith("+1");
}

/**
 * Delivery-report status groups: ACCEPTED, UNDELIVERABLE, REJECTED, DELIVERED,
 * EXPIRED, PENDING. Unknown groups stay non-terminal ("sent") so a late final
 * receipt can still land.
 */
export function mapInfobipStatus(groupName: string | undefined, statusName?: string): "sent" | "delivered" | "delivery_failed" {
  const g = String(groupName ?? statusName ?? "").toUpperCase();
  if (g === "DELIVERED") return "delivered";
  if (g === "UNDELIVERABLE" || g === "REJECTED" || g === "EXPIRED") return "delivery_failed";
  return "sent";
}
