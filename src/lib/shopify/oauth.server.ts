// Shopify one-click OAuth: signed state, callback HMAC checks, token exchange
// and connection storage (same encrypted app_connections row as manual connect).
const enc = new TextEncoder();
export const SHOPIFY_SCOPES = "read_customers,read_orders";
export const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function secret() {
  const s = process.env["SHOPIFY_CLIENT_SECRET"];
  if (!s) throw new Error("Shopify connection is not configured yet.");
  return s;
}
async function hmac(data: string | Uint8Array, key = secret()) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, typeof data === "string" ? enc.encode(data) : data));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function normalizeShop(input: string) {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const full = s.includes(".") ? s : `${s}.myshopify.com`;
  if (!SHOP_RE.test(full)) throw new Error("Enter your store address, for example yourstore.myshopify.com");
  return full;
}

export async function buildInstallUrl(origin: string, userId: string, shop: string) {
  const clientId = process.env["SHOPIFY_CLIENT_ID"];
  if (!clientId) throw new Error("Shopify connection is not configured yet.");
  const payload = b64u(JSON.stringify({ u: userId, s: shop, e: Date.now() + 10 * 60_000, n: crypto.randomUUID() }));
  const state = `${payload}.${hex(await hmac(payload))}`;
  const q = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: `${origin}/api/public/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

export async function readState(state: string) {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || !safeEq(hex(await hmac(payload)), sig)) throw new Error("Invalid state");
  const v = JSON.parse(unb64u(payload)) as { u: string; s: string; e: number };
  if (v.e < Date.now()) throw new Error("This connection link expired. Please try again.");
  return v;
}

export async function verifyQueryHmac(params: URLSearchParams) {
  const given = params.get("hmac") ?? "";
  const msg = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return safeEq(hex(await hmac(msg)), given);
}

export async function verifyWebhookHmac(raw: Uint8Array, header: string | null) {
  if (!header) return false;
  return safeEq(b64(await hmac(raw)), header);
}

export async function exchangeCode(shop: string, code: string) {
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: process.env["SHOPIFY_CLIENT_ID"], client_secret: secret(), code }),
  });
  const j = (await r.json().catch(() => null)) as { access_token?: string; scope?: string } | null;
  if (!r.ok || !j?.access_token) throw new Error("Shopify did not approve the connection.");
  return { accessToken: j.access_token, scopes: (j.scope ?? "").split(",").filter(Boolean) };
}

/** Stores the connection for the user's acting business, reusing the Shopify verify runtime. */
export async function saveShopifyConnection(userId: string, shop: string, accessToken: string, scopes: string[]) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { resolveActingAccount } = await import("@/lib/acting-account.server");
  const { encryptToken } = await import("@/lib/tenant-crypto.server");
  const { runtimeFor } = await import("@/lib/marketplace/providers.server");
  const acting = await resolveActingAccount(userId);
  if (!acting.isOwner && acting.role !== "admin") throw new Error("Only business owners and admins can connect apps.");
  const { data: app } = await db.from("apps").select("id, name").eq("slug", "shopify").maybeSingle();
  if (!app) throw new Error("Shopify app is not available.");
  const creds = { shop_domain: shop, access_token: accessToken };
  const settings: Record<string, unknown> = { oauth: true };
  const verified = await runtimeFor("shopify")!.verify!(creds, { db, accountId: acting.accountId, settings } as never);
  const { data: install, error } = await db
    .from("app_installations")
    .upsert({ app_id: app.id, workspace_id: acting.accountId, user_id: userId, status: "installed", uninstalled_at: null }, { onConflict: "app_id,workspace_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const payload = {
    installation_id: install.id,
    connection_name: app.name,
    external_account_id: verified?.accountId ?? shop,
    external_account_label: verified?.accountLabel ?? shop,
    scopes,
    settings: settings as never,
    status: "connected",
    last_error: null,
    last_synced_at: new Date().toISOString(),
    credentials_encrypted: encryptToken(JSON.stringify(creds)),
  };
  const { data: existing } = await db.from("app_connections").select("id").eq("installation_id", install.id).maybeSingle();
  const res = existing
    ? await db.from("app_connections").update(payload).eq("id", existing.id).select("id").single()
    : await db.from("app_connections").insert(payload).select("id").single();
  if (res.error) throw new Error(res.error.message);
  await db.from("integration_logs").insert({
    app_id: app.id, connection_id: res.data.id, workspace_id: acting.accountId,
    event_type: "connection", action: existing ? "reconnected" : "connected", status: "ok",
    request_data: { method: "oauth" } as never,
  });
}

/** shop/redact or app uninstall: remove stored tokens for that shop. */
export async function forgetShop(shop: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  await db.from("app_connections")
    .update({ status: "disconnected", credentials_encrypted: null, last_error: "Removed from Shopify" } as never)
    .eq("external_account_id", shop);
}
