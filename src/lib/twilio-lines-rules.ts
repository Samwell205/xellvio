// Pure rules for dedicated toll-free lines.

export type LineStatus = "requested" | "account_created" | "number_purchased" | "verification_pending" | "active" | "rejected";

export function mapVerification(status: string | undefined): LineStatus {
  const s = String(status ?? "").toUpperCase();
  if (s === "TWILIO_APPROVED") return "active";
  if (s === "TWILIO_REJECTED") return "rejected";
  return "verification_pending";
}

/**
 * Own line goes first for US/Canada text messages. The shared route is used
 * as backup only when the own line explicitly refused to accept the request
 * (HTTP 4xx/5xx response) — never when the request timed out, because it may
 * already have been accepted and the recipient would get it twice.
 * Twilio 21610 (recipient replied STOP) must never be retried elsewhere.
 */
export function ownLineApplies(to: string, hasMedia: boolean): boolean {
  return !hasMedia && /^\+1\d{10}$/.test(String(to ?? "").trim());
}

export function fallBackFromOwnLine(err: { lineStatus?: number | null; lineCode?: number | null }): boolean {
  if (!err?.lineStatus) return false; // timeout / network: unknown acceptance
  if (Number(err.lineCode) === 21610) return false; // recipient opted out
  return true;
}
