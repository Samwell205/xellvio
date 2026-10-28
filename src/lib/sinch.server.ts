// Second SMS route (Sinch Conversation API). Used for UK destinations so the
// tenant's alphanumeric Sender ID is shown. Telnyx stays the route for every
// other country. Never mention the provider name in tenant-facing UI.
import { createHmac, timingSafeEqual } from "crypto";
import { isSinchDestination } from "./sinch-routing";

const REGION = "us";
const BASE = () => `https://${REGION}.conversation.api.sinch.com/v1/projects/${process.env.SINCH_PROJECT_ID}`;

let cachedToken: { value: string; exp: number } | null = null;
let cachedAppId: string | null = null;

export function sinchConfigured(): boolean {
  return Boolean(process.env.SINCH_PROJECT_ID && process.env.SINCH_KEY_ID && process.env.SINCH_KEY_SECRET);
}

/** Webhook secret derived from the stored key secret, so no extra secret is needed. */
export function sinchWebhookSecret(): string {
  return createHmac("sha256", String(process.env.SINCH_KEY_SECRET ?? "")).update("xellvio-sinch-webhook-v1").digest("hex");
}

export function verifySinchSignature(rawBody: string, headers: Headers): boolean {
  const sig = headers.get("x-sinch-webhook-signature");
  const nonce = headers.get("x-sinch-webhook-signature-nonce");
  const ts = headers.get("x-sinch-webhook-signature-timestamp");
  if (!sig || !nonce || !ts || !process.env.SINCH_KEY_SECRET) return false;
  const expected = createHmac("sha256", sinchWebhookSecret()).update(`${rawBody}.${nonce}.${ts}`).digest("base64");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function token(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const basic = Buffer.from(`${process.env.SINCH_KEY_ID}:${process.env.SINCH_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://auth.sinch.com/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("UK sending route is temporarily unavailable. Please try again.");
  const j: any = await res.json();
  cachedToken = { value: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3000) * 1000 };
  return cachedToken.value;
}

async function appId(): Promise<string> {
  if (cachedAppId) return cachedAppId;
  const res = await fetch(`${BASE()}/apps`, { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(8000) });
  const j: any = await res.json().catch(() => ({}));
  const id = j?.apps?.[0]?.id;
  if (!id) throw new Error("UK sending route is not configured.");
  cachedAppId = id;
  return id;
}

export { isSinchDestination };

export async function sendViaSinch(opts: { to: string; text: string; senderId?: string; timeoutMs?: number }): Promise<{ id: string; parts: number }> {
  const body: any = {
    app_id: await appId(),
    recipient: { identified_by: { channel_identities: [{ channel: "SMS", identity: opts.to }] } },
    message: { text_message: { text: opts.text } },
    channel_priority_order: ["SMS"],
  };
  // Only alphanumeric IDs override the sender; phone numbers from the other
  // route are not owned on this account and would be rejected.
  if (opts.senderId && !opts.senderId.startsWith("+")) body.channel_properties = { SMS_SENDER: opts.senderId };
  const res = await fetch(`${BASE()}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.message_id) {
    throw new Error(`Message was not accepted for UK delivery${j?.error?.message ? `: ${String(j.error.message).slice(0, 200)}` : ""}`);
  }
  const { calculateSegments } = await import("./sms-segments");
  const parts = Number((calculateSegments(opts.text) as any).segments) || 1;
  return { id: j.message_id, parts };
}

/** Registers the delivery-report webhook on the Sinch app (idempotent). */
export async function ensureSinchWebhook(url: string): Promise<{ created: boolean }> {
  const app = await appId();
  const H = { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" };
  const list: any = await (await fetch(`${BASE()}/apps/${app}/webhooks`, { headers: H })).json();
  if ((list?.webhooks ?? []).some((w: any) => w.target === url)) return { created: false };
  const res = await fetch(`${BASE()}/webhooks`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ app_id: app, target: url, target_type: "HTTP", secret: sinchWebhookSecret(), triggers: ["MESSAGE_DELIVERY", "MESSAGE_INBOUND"] }),
  });
  if (!res.ok) throw new Error(`webhook create failed ${res.status}`);
  return { created: true };
}
