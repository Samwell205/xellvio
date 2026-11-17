// Non-US/CA sending: all businesses send from the international main account
// (TWILIO_INTL_*); no per-business sub-accounts (owner decision 2026-11-17).
// Tenant-facing errors never name the provider.

const API = "https://api.twilio.com/2010-04-01";
const basic = (sid: string, tok: string) => "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
const unavailable = () => new Error("International sender setup is unavailable. Please contact support; no additional registration is needed for this setup error.");

function intlParent(): { sid: string; token: string } {
  const sid = process.env.TWILIO_INTL_ACCOUNT_SID;
  const token = process.env.TWILIO_INTL_AUTH_TOKEN;
  if (!sid || !token) throw new Error("International sending is temporarily unavailable.");
  return { sid, token };
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Auth token for an international sub-account (or the intl parent), else null. */
export async function intlTokenFor(accountSid: string): Promise<string | null> {
  if (!accountSid) return null;
  if (accountSid === process.env.TWILIO_INTL_ACCOUNT_SID) return process.env.TWILIO_INTL_AUTH_TOKEN ?? null;
  const db = await admin();
  const { data } = await db.from("tenant_intl_subaccounts").select("auth_token_enc").eq("subaccount_sid", accountSid).maybeSingle();
  if (!data) return null;
  if (data.auth_token_enc) {
    const { data: tok } = await db.rpc("decrypt_twilio_token", { _cipher: data.auth_token_enc });
    if (tok) return tok;
  }
  try {
    const p = intlParent();
    const res = await fetch(`${API}/Accounts/${accountSid}.json`, { headers: { Authorization: basic(p.sid, p.token) }, signal: AbortSignal.timeout(10000) });
    const j: any = await res.json().catch(() => ({}));
    return res.ok ? j?.auth_token ?? null : null;
  } catch { return null; }
}

/**
 * Owner decision 2026-11-17: new international sub-accounts can't be created
 * (provider cap), so every business sends non-US/CA texts straight from the
 * international main account. No sub-account is created or required.
 */
export async function ensureIntlSubaccount(_accountId: string): Promise<{ sid: string; token: string }> {
  return intlParent();
}

/** Sends one non-US/CA message from the business's own international sub-account. */
export async function sendViaIntl(accountId: string, opts: { to: string; from: string; text: string; mediaUrls?: string[]; timeoutMs?: number }): Promise<{ id: string; parts: number }> {
  const sub = await ensureIntlSubaccount(accountId);
  const form = new URLSearchParams({ To: opts.to, From: opts.from, Body: opts.text, StatusCallback: "https://xellvio.com/api/public/twilio/status" });
  for (const url of opts.mediaUrls ?? []) form.append("MediaUrl", url);
  const res = await fetch(`${API}/Accounts/${sub.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: basic(sub.sid, sub.token), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.sid) {
    const err: any = new Error(`Message refused${j?.message ? `: ${String(j.message).replace(/twilio/gi, "carrier").slice(0, 200)}` : ""}`);
    if (res.status === 429 || j?.code === 20429) { err.message = `429 rate limit: ${err.message}`; err.telnyxCode = "10011"; }
    else err.telnyxCode = j?.code ? `TW${j.code}` : undefined;
    throw err;
  }
  return { id: j.sid, parts: Number(j.num_segments) || 1 };
}
