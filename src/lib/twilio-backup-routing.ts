// Pure rules for the US/Canada backup route (Twilio toll-free). Never name the
// provider in tenant-facing UI.

/** Twilio message SIDs: "SM" or "MM" + 32 hex chars. */
export function isTwilioMessageId(id: string | null | undefined): boolean {
  return /^(SM|MM)[0-9a-f]{32}$/.test(String(id ?? ""));
}

/**
 * Backup is used only when the primary route explicitly refused to accept the
 * request for a platform-side reason (account/funding/auth) or was unavailable
 * (503). Timeouts and carrier refusals (e.g. 40002 spam, 40008) never fail over:
 * a timeout may already have been accepted (duplicate risk) and a carrier
 * refusal would just be refused again.
 */
export function shouldUseBackup(opts: {
  to: string;
  hasMedia?: boolean;
  enabled: boolean;
  primaryStatus?: number | null;
  primaryDetail?: string | null;
}): boolean {
  if (!opts.enabled || opts.hasMedia) return false;
  if (!/^\+1\d{10}$/.test(String(opts.to ?? "").trim())) return false;
  const s = Number(opts.primaryStatus ?? 0);
  if (s === 401 || s === 402 || s === 403 || s === 503) return true;
  return /balance|insufficient|fund|payment|account (is )?(disabled|suspended)/i.test(String(opts.primaryDetail ?? ""));
}

export function mapTwilioStatus(status: string | undefined): "sent" | "delivered" | "delivery_failed" | null {
  const s = String(status ?? "").toLowerCase();
  if (s === "delivered" || s === "read") return "delivered";
  if (s === "undelivered" || s === "failed") return "delivery_failed";
  if (s === "sent") return "sent";
  return null; // queued/accepted/sending: not a receipt worth recording
}
