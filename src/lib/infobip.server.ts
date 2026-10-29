// International SMS route (non-US/Canada, non-UK). Used inside sendMessage like
// the UK route: screening, charging and opt-out checks already ran upstream.
// Never mention the provider name in tenant-facing UI.
import { createHmac, timingSafeEqual } from "crypto";

let cachedBase: string | null = null;

export function infobipConfigured(): boolean {
  return Boolean(process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL);
}

/** Webhook token derived from the stored API key, so no extra secret is needed. */
export function infobipWebhookToken(): string {
  return createHmac("sha256", String(process.env.INFOBIP_API_KEY ?? "")).update("xellvio-infobip-dlr-v1").digest("hex");
}

export function verifyInfobipWebhookToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(infobipWebhookToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function infobipNotifyUrl(): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "https://xellvio.com").replace(/\/$/, "");
  return `${base}/api/public/infobip/webhook?token=${infobipWebhookToken()}`;
}

/**
 * The stored base URL may redirect to the account's real API host. Resolve once
 * with an unauthenticated request so credentials never cross hosts, then cache.
 */
async function apiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  const raw = String(process.env.INFOBIP_BASE_URL ?? "").replace(/\/$/, "");
  if (!/^https:\/\/[a-z0-9.-]+/i.test(raw)) throw new Error("International sending route is not configured.");
  cachedBase = raw;
  try {
    const res = await fetch(raw, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const u = new URL(loc, raw);
        cachedBase = `${u.protocol}//${u.host}`;
      }
    }
  } catch {
    // Keep the raw base; the send call will surface a real error if any.
  }
  return cachedBase;
}

export async function sendViaInfobip(opts: {
  to: string;
  text: string;
  senderId?: string;
  callbackData?: string;
  timeoutMs?: number;
}): Promise<{ id: string; parts: number }> {
  const base = await apiBase();
  const message: any = {
    destinations: [{ to: String(opts.to).replace(/^\+/, "") }],
    text: opts.text,
    notifyUrl: infobipNotifyUrl(),
    notifyContentType: "application/json",
  };
  if (opts.senderId) message.from = opts.senderId;
  if (opts.callbackData) message.callbackData = opts.callbackData;
  const res = await fetch(`${base}/sms/2/text/advanced`, {
    method: "POST",
    headers: { Authorization: `App ${process.env.INFOBIP_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [message] }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  const j: any = await res.json().catch(() => ({}));
  const m = Array.isArray(j?.messages) ? j.messages[0] : null;
  const group = String(m?.status?.groupName ?? "").toUpperCase();
  const refused = !res.ok || !m?.messageId || group === "REJECTED" || group === "UNDELIVERABLE";
  if (refused) {
    const detail = String(m?.status?.description ?? j?.requestError?.serviceException?.text ?? "").slice(0, 200);
    throw new Error(`Message was not accepted for delivery${detail ? `: ${detail}` : "."}`);
  }
  const { calculateSegments } = await import("./sms-segments");
  const parts = Number((calculateSegments(opts.text) as any).segments) || 1;
  return { id: m.messageId, parts };
}

/**
 * Receipt lookup for a single international-route message. Returns the primary
 * route's receipt shape, or null while no final receipt exists yet.
 */
export async function getInfobipReceipt(id: string, boundedDispatch = false): Promise<any | null> {
  const base = await apiBase();
  const res = await fetch(`${base}/sms/1/logs?messageId=${encodeURIComponent(id)}&limit=1`, {
    headers: { Authorization: `App ${process.env.INFOBIP_API_KEY}` },
    signal: AbortSignal.timeout(boundedDispatch ? 2500 : 8000),
  });
  if (!res.ok) throw new Error("Delivery receipt is not available on the configured connections.");
  const j: any = await res.json().catch(() => ({}));
  const row = Array.isArray(j?.results) ? j.results.find((r: any) => String(r?.messageId ?? "") === id) : null;
  if (!row) throw new Error("Delivery receipt is not available on the configured connections.");
  const { mapInfobipStatus } = await import("./infobip-routing");
  const mapped = mapInfobipStatus(row?.status?.groupName, row?.status?.name);
  if (mapped === "sent") return null;
  const errors = mapped === "delivery_failed"
    ? [{ code: row?.status?.id != null ? `IB_${row.status.id}` : "IB_FAILED", detail: String(row?.status?.description ?? "Recipient network did not deliver the message.") }]
    : [];
  return {
    id,
    status: mapped,
    to: [{ status: mapped, errors, delivered_at: row?.doneAt ?? null }],
    completed_at: row?.doneAt ?? null,
  };
}
