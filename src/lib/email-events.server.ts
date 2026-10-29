import { z } from "zod";
import { emailProviderRequest } from "./email-campaigns.server";

function decode(value: string) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
export function derToRaw(signature: Uint8Array) {
  if (signature.length === 64) return signature;
  if (signature[0] !== 0x30 || signature[2] !== 2) throw new Error("Invalid signature");
  const rLength = signature[3] ?? 0; const sOffset = 4 + rLength;
  if (signature[sOffset] !== 2) throw new Error("Invalid signature");
  const sLength = signature[sOffset + 1] ?? 0;
  const raw = new Uint8Array(64);
  for (const [part, offset] of [[signature.slice(4, 4 + rLength), 0], [signature.slice(sOffset + 2, sOffset + 2 + sLength), 32]] as const) {
    const normalized = part.length === 33 && part[0] === 0 ? part.slice(1) : part;
    if (normalized.length > 32 || !normalized.length) throw new Error("Invalid signature");
    raw.set(normalized, offset + 32 - normalized.length);
  }
  return raw;
}
export async function verifyEmailEvent(request: Request, raw: string) {
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp");
  const signature = request.headers.get("x-twilio-email-event-webhook-signature");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 600) return false;
  try {
    const res = await emailProviderRequest("/user/webhooks/event/settings");
    if (!res.ok) return false;
    const settings = await res.json() as { webhooks?: { id: string; url: string }[] };
    const hook = settings.webhooks?.find((h) => h.url === "https://xellvio.com/api/public/email/events");
    if (!hook) return false;
    const keyResponse = await emailProviderRequest(`/user/webhooks/event/settings/signed/${hook.id}`);
    if (!keyResponse.ok) return false;
    const { public_key } = await keyResponse.json() as { public_key: string };
    const der = decode(public_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
    const key = await crypto.subtle.importKey("spki", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(derToRaw(decode(signature))), new TextEncoder().encode(timestamp + raw));
  } catch { return false; }
}
const events = z.array(z.object({ sg_event_id: z.string().max(250), xellvio_recipient_id: z.string().uuid().optional(),
  event: z.enum(["processed", "delivered", "bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe", "open", "click", "deferred", "group_resubscribe"]),
  timestamp: z.number().int().min(0), reason: z.string().max(2000).optional(), response: z.string().max(2000).optional() }).passthrough()).max(1000);
export async function applyEmailEvents(raw: string) {
  const parsed = events.parse(JSON.parse(raw));
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  for (const e of parsed) {
    if (!e.xellvio_recipient_id) continue;
    const { error } = await db.rpc("email_apply_event", { _event_id: e.sg_event_id, _recipient: e.xellvio_recipient_id,
      _event: e.event, _at: new Date(e.timestamp * 1000).toISOString(), _reason: e.reason ?? e.response });
    if (error) throw error;
  }
  return { ok: true };
}