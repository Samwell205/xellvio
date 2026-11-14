// Non-US/CA sending: one separate sub-account per business on the dedicated
// international carrier parent (TWILIO_INTL_*). Created when the business
// submits a sender name, or lazily on its first international send.
// Tenant-facing errors never name the provider.

const API = "https://api.twilio.com/2010-04-01";
const basic = (sid: string, tok: string) => "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
const unavailable = () => new Error("International sender setup is unavailable. Please contact support; no additional registration is needed for this setup error.");
const preparing = () => Object.assign(new Error("429 rate limit: international sender is being prepared"), { telnyxCode: "10011" });

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

/** Returns the business's international sub-account, creating it once if missing. */
export async function ensureIntlSubaccount(accountId: string): Promise<{ sid: string; token: string }> {
  const db = await admin();
  const { data: row, error: readError } = await db.from("tenant_intl_subaccounts").select("subaccount_sid,status,updated_at").eq("account_id", accountId).maybeSingle();
  if (readError) throw unavailable();
  if (row?.subaccount_sid) {
    const token = await intlTokenFor(row.subaccount_sid);
    if (token) return { sid: row.subaccount_sid, token };
    // Credential lookup failure is never permission to replace an owned account.
    throw unavailable();
  }
  // Claim the row first so concurrent sends don't create duplicate sub-accounts.
  if (!row) {
    const { error } = await db.from("tenant_intl_subaccounts").insert({ account_id: accountId, status: "creating" });
    if (error && !String(error.message).includes("duplicate")) throw new Error("International sending is temporarily unavailable.");
    if (error) {
      // Another worker is creating it; wait briefly for it.
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { data: again } = await db.from("tenant_intl_subaccounts").select("subaccount_sid").eq("account_id", accountId).maybeSingle();
        if (again?.subaccount_sid) {
          const token = await intlTokenFor(again.subaccount_sid);
          if (token) return { sid: again.subaccount_sid, token };
        }
      }
      throw preparing();
    }
  } else {
    if (row.status === "creating" && Date.now() - Date.parse(row.updated_at) < 60000) throw preparing();
    const { data: claimed, error } = await db.from("tenant_intl_subaccounts")
      .update({ status: "creating", updated_at: new Date().toISOString() })
      .eq("account_id", accountId).eq("updated_at", row.updated_at).is("subaccount_sid", null)
      .select("account_id").maybeSingle();
    if (error) throw unavailable();
    if (!claimed) throw preparing();
  }
  const p = intlParent();
  const friendlyName = `xellvio-intl-${accountId}`;
  // Recover a previously created account before attempting another POST (e.g.
  // after an ambiguous timeout or a failed database save). Never adopt a match
  // from another parent, or choose between multiple matches automatically.
  const lookup = await fetch(`${API}/Accounts.json?${new URLSearchParams({ FriendlyName: friendlyName, PageSize: "2" })}`, {
    headers: { Authorization: basic(p.sid, p.token) }, signal: AbortSignal.timeout(10000),
  });
  if (!lookup.ok) throw unavailable();
  const matches: any = await lookup.json();
  if (!Array.isArray(matches.accounts)) throw unavailable();
  if (matches.accounts.length > 0) {
    const found = matches.accounts[0];
    if (matches.accounts.length !== 1 || matches.next_page_uri || found.owner_account_sid !== p.sid || found.friendly_name !== friendlyName || found.status !== "active" || !found.sid || !found.auth_token) throw unavailable();
    const { data: enc, error: encryptError } = await db.rpc("encrypt_twilio_token", { _plain: found.auth_token });
    if (encryptError || !enc) throw unavailable();
    const { error: saveError } = await db.from("tenant_intl_subaccounts").update({ subaccount_sid: found.sid, auth_token_enc: enc, status: "active", last_error: null, updated_at: new Date().toISOString() }).eq("account_id", accountId);
    if (saveError) throw unavailable();
    return { sid: found.sid, token: found.auth_token };
  }
  const res = await fetch(`${API}/Accounts.json`, {
    method: "POST",
    headers: { Authorization: basic(p.sid, p.token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ FriendlyName: friendlyName }),
    signal: AbortSignal.timeout(15000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.sid || !j?.auth_token) {
    console.error(`[intl-sub] create failed ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    await db.from("tenant_intl_subaccounts").update({ status: "failed", last_error: String(j?.message ?? res.status).slice(0, 300), updated_at: new Date().toISOString() }).eq("account_id", accountId);
    if (Number(j?.code) === 21480) throw Object.assign(unavailable(), { internationalSetupCode: "capacity_exhausted" });
    throw unavailable();
  }
  const { data: enc, error: encryptError } = await db.rpc("encrypt_twilio_token", { _plain: j.auth_token });
  if (encryptError || !enc) throw unavailable();
  const { error: saveError } = await db.from("tenant_intl_subaccounts").update({ subaccount_sid: j.sid, auth_token_enc: enc, status: "active", last_error: null, updated_at: new Date().toISOString() }).eq("account_id", accountId);
  if (saveError) throw unavailable();
  return { sid: j.sid, token: j.auth_token };
}

/** Sends one non-US/CA message from the business's own international sub-account. */
export async function sendViaIntl(accountId: string, opts: { to: string; from: string; text: string; mediaUrls?: string[]; timeoutMs?: number }): Promise<{ id: string; parts: number }> {
  const sub = await ensureIntlSubaccount(accountId);
  if (sub.sid === process.env.TWILIO_INTL_ACCOUNT_SID) throw new Error("International sending is temporarily unavailable.");
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
