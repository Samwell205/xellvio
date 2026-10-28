// US/Canada backup SMS route via the platform's Twilio toll-free number.
// Switched on only when platform_settings.twilio_backup_enabled = "true"
// (set by admin after carrier toll-free verification is approved).
import { createHmac, timingSafeEqual } from "crypto";

const TTL = 60_000;
let cache: { at: number; enabled: boolean; from: string | null } | null = null;

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export async function twilioBackupState(): Promise<{ enabled: boolean; from: string | null }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("platform_settings").select("key,value")
    .in("key", ["twilio_backup_enabled", "twilio_backup_from"]);
  const m = new Map((data ?? []).map((r: any) => [r.key, String(r.value ?? "").replace(/"/g, "")]));
  const from = m.get("twilio_backup_from") || null;
  cache = { at: Date.now(), enabled: twilioConfigured() && m.get("twilio_backup_enabled") === "true" && Boolean(from), from };
  return cache;
}

export function twilioStatusUrl(): string {
  return "https://xellvio.com/api/public/twilio/status";
}

export async function sendViaTwilio(opts: { to: string; text: string; from: string; timeoutMs?: number }): Promise<{ id: string; parts: number }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const basic = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: opts.to, From: opts.from, Body: opts.text, StatusCallback: twilioStatusUrl() }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.sid) {
    console.error(`Backup route refused [${res.status}]: ${JSON.stringify(j).slice(0, 300)}`);
    throw new Error("Sending is temporarily unavailable. Please contact support.");
  }
  return { id: j.sid, parts: Number(j.num_segments) || 1 };
}

/** Validates X-Twilio-Signature: base64(HMAC-SHA1(url + sorted key+value pairs)). */
export function verifyTwilioSignature(url: string, params: URLSearchParams, signature: string | null, token: string | null | undefined = process.env.TWILIO_AUTH_TOKEN): boolean {
  if (!token || !signature) return false;
  const keys = [...new Set([...params.keys()])].sort();
  const data = url + keys.map((k) => k + params.getAll(k).join("")).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
