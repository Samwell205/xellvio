// ============================================================================
// Xellvio Integration Engine — server runtime for each connector.
//
// Every connector may implement:
//   verify() — proves the pasted credentials really work before we store them
//   sync()   — pulls provider records into Xellvio's canonical contact store
//   send()   — pushes a message/payload out through the provider
//
// Nothing here ever runs in the browser: credentials are decrypted server-side
// only, and provider responses are summarised before they leave this module.
// ============================================================================

import { createHash } from "crypto";

export type Creds = Record<string, string>;
export type Settings = Record<string, unknown>;

export type VerifyResult = {
  accountId?: string | null;
  accountLabel?: string | null;
  note?: string;
};

export type SyncResult = { imported: number; updated: number; skipped: number; message: string };

export type RuntimeCtx = {
  db: any;
  /** Workspace performing the sync (the acting Xellvio account). */
  accountId: string;
  settings: Settings;
};

export type ProviderRuntime = {
  verify?: (creds: Creds, ctx: RuntimeCtx) => Promise<VerifyResult>;
  sync?: (creds: Creds, ctx: RuntimeCtx) => Promise<SyncResult>;
  send?: (creds: Creds, ctx: RuntimeCtx, payload: { text: string; to?: string }) => Promise<{ ok: true }>;
};

// ── HTTP helper ─────────────────────────────────────────────────────────────

async function http(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: any; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  } catch (e: any) {
    throw new Error(e?.name === "AbortError" ? "The provider did not respond in time." : `Could not reach the provider: ${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

function fail(provider: string, r: { status: number; body: any; text: string }): never {
  const detail =
    r.body?.error?.message ||
    r.body?.message ||
    r.body?.errors?.[0]?.detail ||
    r.body?.errors?.[0]?.message ||
    (typeof r.body?.errors === "string" ? r.body.errors : null) ||
    r.text.slice(0, 200) ||
    `HTTP ${r.status}`;
  throw new Error(`${provider} rejected the credentials (${r.status}): ${detail}`);
}

function need(creds: Creds, keys: string[]) {
  const missing = keys.filter((k) => !creds[k]?.trim());
  if (missing.length) throw new Error(`Missing required field(s): ${missing.join(", ")}`);
}

function cleanHost(raw: string): string {
  return raw.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function httpsUrl(raw: string): string {
  const v = raw.trim();
  const url = new URL(v.startsWith("http") ? v : `https://${v}`);
  if (url.protocol !== "https:") throw new Error("Only https URLs are accepted.");
  return url.toString().replace(/\/+$/, "");
}

// ── Canonical contact upsert ────────────────────────────────────────────────

export type IncomingContact = {
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  source?: string | null;
};

/**
 * Stores provider records as Xellvio contacts. Phone numbers are normalised to
 * E.164, deduplicated, and suppressed numbers are never re-added.
 */
export async function upsertContacts(
  db: any,
  accountId: string,
  incoming: IncomingContact[],
  source: string,
): Promise<SyncResult> {
  const { normalizePhone } = await import("@/lib/phone-normalize");
  const byPhone = new Map<string, { first: string | null; last: string | null; email: string | null; country: string }>();
  let skipped = 0;

  for (const row of incoming) {
    const raw = (row.phone ?? "").trim();
    if (!raw) {
      skipped++;
      continue;
    }
    const norm = normalizePhone(raw, { defaultCountry: "US" });
    if ("error" in norm) {
      skipped++;
      continue;
    }
    const prev = byPhone.get(norm.e164);
    byPhone.set(norm.e164, {
      first: row.first_name?.trim() || prev?.first || null,
      last: row.last_name?.trim() || prev?.last || null,
      email: row.email?.trim() || prev?.email || null,
      country: norm.country,
    });
  }
  if (byPhone.size === 0) return { imported: 0, updated: 0, skipped, message: "No usable phone numbers found." };

  const phones = [...byPhone.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < phones.length; i += 500) chunks.push(phones.slice(i, i + 500));

  const suppressed = new Set<string>();
  const existing = new Map<string, { id: string; first_name: string | null; last_name: string | null }>();
  for (const chunk of chunks) {
    const [{ data: sup }, { data: prof }] = await Promise.all([
      db.from("suppressions").select("phone_e164").eq("account_id", accountId).in("phone_e164", chunk),
      db.from("profiles").select("id, phone_e164, first_name, last_name").eq("account_id", accountId).in("phone_e164", chunk),
    ]);
    for (const s of sup ?? []) suppressed.add(s.phone_e164);
    for (const p of prof ?? []) existing.set(p.phone_e164, p);
  }

  const inserts: any[] = [];
  const updates: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];

  for (const [phone, v] of byPhone) {
    if (suppressed.has(phone)) {
      skipped++;
      continue;
    }
    const found = existing.get(phone);
    if (!found) {
      inserts.push({
        account_id: accountId,
        phone_e164: phone,
        first_name: v.first,
        last_name: v.last,
        country_code: v.country,
        custom_fields: { source, ...(v.email ? { email: v.email } : {}) },
      });
    } else if ((v.first && !found.first_name) || (v.last && !found.last_name)) {
      updates.push({
        id: found.id,
        first_name: found.first_name || v.first,
        last_name: found.last_name || v.last,
      });
    }
  }

  let imported = 0;
  for (let i = 0; i < inserts.length; i += 500) {
    const batch = inserts.slice(i, i + 500);
    const { error } = await db.from("profiles").insert(batch);
    if (error) throw new Error(error.message);
    imported += batch.length;
  }
  for (const u of updates) {
    await db.from("profiles").update({ first_name: u.first_name, last_name: u.last_name }).eq("id", u.id);
  }

  return {
    imported,
    updated: updates.length,
    skipped,
    message: `${imported} new contact${imported === 1 ? "" : "s"} added, ${updates.length} updated, ${skipped} skipped.`,
  };
}

// ── Shared webhook connector (Zapier / Make / n8n / custom / Slack style) ───

function webhookRuntime(name: string, key = "endpoint"): ProviderRuntime {
  return {
    verify: async (creds) => {
      need(creds, [key]);
      const url = httpsUrl(creds[key]!);
      const payload = JSON.stringify({
        source: "xellvio",
        event: "connection.test",
        message: `Xellvio connected to ${name}.`,
        text: `Xellvio connected to ${name}.`,
        content: `Xellvio connected to ${name}.`,
        sent_at: new Date().toISOString(),
      });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (creds["secret"]) {
        headers["x-xellvio-signature"] = createHash("sha256").update(`${creds["secret"]}.${payload}`).digest("hex");
      }
      const r = await http(url, { method: "POST", headers, body: payload });
      if (r.status >= 400) fail(name, r);
      return { accountLabel: new URL(url).host, note: "Test payload delivered." };
    },
    send: async (creds, _ctx, payload) => {
      const url = httpsUrl(creds[key]!);
      const r = await http(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: payload.text, content: payload.text, to: payload.to ?? null, source: "xellvio" }),
      });
      if (r.status >= 400) fail(name, r);
      return { ok: true as const };
    },
  };
}

// ── Connector registry ──────────────────────────────────────────────────────

export const RUNTIMES: Record<string, ProviderRuntime> = {
  // ── Shopify: the reference implementation ────────────────────────────────
  shopify: {
    verify: async (creds) => {
      need(creds, ["shop_domain", "access_token"]);
      const host = cleanHost(creds["shop_domain"]!);
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) {
        throw new Error("Enter your store domain, for example example.myshopify.com");
      }
      const r = await http(`https://${host}/admin/api/2024-07/shop.json`, {
        headers: { "X-Shopify-Access-Token": creds["access_token"]!, accept: "application/json" },
      });
      if (r.status >= 400 || !r.body?.shop) fail("Shopify", r);
      return {
        accountId: String(r.body.shop.id),
        accountLabel: `${r.body.shop.name} (${host})`,
        note: `Connected to ${r.body.shop.name}.`,
      };
    },
    sync: async (creds, ctx) => {
      const host = cleanHost(creds["shop_domain"]!);
      const contacts: IncomingContact[] = [];
      let url: string | null = `https://${host}/admin/api/2024-07/customers.json?limit=250&fields=id,first_name,last_name,email,phone,default_address`;
      for (let page = 0; page < 8 && url; page++) {
        const res = await fetch(url, {
          headers: { "X-Shopify-Access-Token": creds["access_token"]!, accept: "application/json" },
        });
        const text = await res.text();
        if (res.status >= 400) fail("Shopify", { status: res.status, body: safeJson(text), text });
        const body = safeJson(text);
        for (const c of body?.customers ?? []) {
          contacts.push({
            phone: c.phone ?? c.default_address?.phone ?? null,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
          });
        }
        url = nextLink(res.headers.get("link"));
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "shopify");
    },
  },

  woocommerce: {
    verify: async (creds) => {
      need(creds, ["store_url", "consumer_key", "consumer_secret"]);
      const base = httpsUrl(creds["store_url"]!);
      const r = await http(
        `${base}/wp-json/wc/v3/customers?per_page=1&consumer_key=${encodeURIComponent(creds["consumer_key"]!)}&consumer_secret=${encodeURIComponent(creds["consumer_secret"]!)}`,
      );
      if (r.status >= 400) fail("WooCommerce", r);
      return { accountLabel: new URL(base).host };
    },
    sync: async (creds, ctx) => {
      const base = httpsUrl(creds["store_url"]!);
      const contacts: IncomingContact[] = [];
      for (let page = 1; page <= 8; page++) {
        const r = await http(
          `${base}/wp-json/wc/v3/customers?per_page=100&page=${page}&consumer_key=${encodeURIComponent(creds["consumer_key"]!)}&consumer_secret=${encodeURIComponent(creds["consumer_secret"]!)}`,
        );
        if (r.status >= 400) fail("WooCommerce", r);
        const rows: any[] = Array.isArray(r.body) ? r.body : [];
        for (const c of rows) {
          contacts.push({
            phone: c.billing?.phone ?? null,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
          });
        }
        if (rows.length < 100) break;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "woocommerce");
    },
  },

  bigcommerce: {
    verify: async (creds) => {
      need(creds, ["store_hash", "access_token"]);
      const r = await http(`https://api.bigcommerce.com/stores/${encodeURIComponent(creds["store_hash"]!)}/v2/store`, {
        headers: { "X-Auth-Token": creds["access_token"]!, accept: "application/json" },
      });
      if (r.status >= 400) fail("BigCommerce", r);
      return { accountId: String(r.body?.id ?? ""), accountLabel: r.body?.name ?? creds["store_hash"]! };
    },
    sync: async (creds, ctx) => {
      const r = await http(
        `https://api.bigcommerce.com/stores/${encodeURIComponent(creds["store_hash"]!)}/v3/customers?limit=250`,
        { headers: { "X-Auth-Token": creds["access_token"]!, accept: "application/json" } },
      );
      if (r.status >= 400) fail("BigCommerce", r);
      const contacts = (r.body?.data ?? []).map((c: any) => ({
        phone: c.phone,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
      }));
      return upsertContacts(ctx.db, ctx.accountId, contacts, "bigcommerce");
    },
  },

  stripe: {
    verify: async (creds) => {
      need(creds, ["secret_key"]);
      const r = await http("https://api.stripe.com/v1/customers?limit=1", {
        headers: { authorization: `Bearer ${creds["secret_key"]}` },
      });
      if (r.status >= 400) fail("Stripe", r);
      return { accountLabel: creds["secret_key"]!.startsWith("sk_test") || creds["secret_key"]!.startsWith("rk_test") ? "Stripe (test mode)" : "Stripe (live)" };
    },
    sync: async (creds, ctx) => {
      const contacts: IncomingContact[] = [];
      let starting: string | null = null;
      for (let page = 0; page < 8; page++) {
        const url = `https://api.stripe.com/v1/customers?limit=100${starting ? `&starting_after=${starting}` : ""}`;
        const r = await http(url, { headers: { authorization: `Bearer ${creds["secret_key"]}` } });
        if (r.status >= 400) fail("Stripe", r);
        const rows: any[] = r.body?.data ?? [];
        for (const c of rows) {
          const [first, ...rest] = String(c.name ?? "").trim().split(/\s+/);
          contacts.push({ phone: c.phone, email: c.email, first_name: first || null, last_name: rest.join(" ") || null });
        }
        if (!r.body?.has_more || rows.length === 0) break;
        starting = rows[rows.length - 1]!.id;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "stripe");
    },
  },

  paystack: {
    verify: async (creds) => {
      need(creds, ["secret_key"]);
      const r = await http("https://api.paystack.co/customer?perPage=1", {
        headers: { authorization: `Bearer ${creds["secret_key"]}` },
      });
      if (r.status >= 400) fail("Paystack", r);
      return { accountLabel: "Paystack" };
    },
    sync: async (creds, ctx) => {
      const contacts: IncomingContact[] = [];
      for (let page = 1; page <= 8; page++) {
        const r = await http(`https://api.paystack.co/customer?perPage=100&page=${page}`, {
          headers: { authorization: `Bearer ${creds["secret_key"]}` },
        });
        if (r.status >= 400) fail("Paystack", r);
        const rows: any[] = r.body?.data ?? [];
        for (const c of rows) contacts.push({ phone: c.phone, email: c.email, first_name: c.first_name, last_name: c.last_name });
        if (rows.length < 100) break;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "paystack");
    },
  },

  flutterwave: {
    verify: async (creds) => {
      need(creds, ["secret_key"]);
      const r = await http("https://api.flutterwave.com/v3/subaccounts?page=1", {
        headers: { authorization: `Bearer ${creds["secret_key"]}` },
      });
      if (r.status >= 400) fail("Flutterwave", r);
      return { accountLabel: "Flutterwave" };
    },
  },

  paypal: {
    verify: async (creds) => {
      need(creds, ["client_id", "client_secret"]);
      const live = (creds["environment"] ?? "live").toLowerCase() !== "sandbox";
      const host = live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const basic = Buffer.from(`${creds["client_id"]}:${creds["client_secret"]}`).toString("base64");
      const r = await http(`${host}/v1/oauth2/token`, {
        method: "POST",
        headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (r.status >= 400 || !r.body?.access_token) fail("PayPal", r);
      return { accountLabel: live ? "PayPal (live)" : "PayPal (sandbox)" };
    },
  },

  hubspot: {
    verify: async (creds) => {
      need(creds, ["access_token"]);
      const r = await http("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
        headers: { authorization: `Bearer ${creds["access_token"]}` },
      });
      if (r.status >= 400) fail("HubSpot", r);
      return { accountLabel: "HubSpot CRM" };
    },
    sync: async (creds, ctx) => {
      const contacts: IncomingContact[] = [];
      let after: string | null = null;
      for (let page = 0; page < 8; page++) {
        const url = `https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=phone,mobilephone,firstname,lastname,email${after ? `&after=${after}` : ""}`;
        const r = await http(url, { headers: { authorization: `Bearer ${creds["access_token"]}` } });
        if (r.status >= 400) fail("HubSpot", r);
        for (const c of r.body?.results ?? []) {
          const p = c.properties ?? {};
          contacts.push({ phone: p.mobilephone || p.phone, first_name: p.firstname, last_name: p.lastname, email: p.email });
        }
        after = r.body?.paging?.next?.after ?? null;
        if (!after) break;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "hubspot");
    },
  },

  klaviyo: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const r = await http("https://a.klaviyo.com/api/accounts/", {
        headers: { authorization: `Klaviyo-API-Key ${creds["api_key"]}`, revision: "2024-10-15", accept: "application/json" },
      });
      if (r.status >= 400) fail("Klaviyo", r);
      const acct = r.body?.data?.[0];
      return { accountId: acct?.id ?? null, accountLabel: acct?.attributes?.contact_information?.organization_name ?? "Klaviyo" };
    },
    sync: async (creds, ctx) => {
      const contacts: IncomingContact[] = [];
      let url: string | null = "https://a.klaviyo.com/api/profiles/?page[size]=100";
      for (let page = 0; page < 8 && url; page++) {
        const r = await http(url, {
          headers: { authorization: `Klaviyo-API-Key ${creds["api_key"]}`, revision: "2024-10-15", accept: "application/json" },
        });
        if (r.status >= 400) fail("Klaviyo", r);
        for (const p of r.body?.data ?? []) {
          const a = p.attributes ?? {};
          contacts.push({ phone: a.phone_number, email: a.email, first_name: a.first_name, last_name: a.last_name });
        }
        url = r.body?.links?.next ?? null;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "klaviyo");
    },
  },

  mailchimp: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const dc = creds["api_key"]!.split("-")[1];
      if (!dc) throw new Error("Mailchimp keys end with a data-centre suffix such as -us21.");
      const basic = Buffer.from(`anystring:${creds["api_key"]}`).toString("base64");
      const r = await http(`https://${dc}.api.mailchimp.com/3.0/`, { headers: { authorization: `Basic ${basic}` } });
      if (r.status >= 400) fail("Mailchimp", r);
      return { accountId: r.body?.account_id ?? null, accountLabel: r.body?.account_name ?? "Mailchimp" };
    },
  },

  activecampaign: {
    verify: async (creds) => {
      need(creds, ["base_url", "api_key"]);
      const base = httpsUrl(creds["base_url"]!);
      const r = await http(`${base}/api/3/contacts?limit=1`, { headers: { "Api-Token": creds["api_key"]! } });
      if (r.status >= 400) fail("ActiveCampaign", r);
      return { accountLabel: new URL(base).host };
    },
    sync: async (creds, ctx) => {
      const base = httpsUrl(creds["base_url"]!);
      const contacts: IncomingContact[] = [];
      for (let offset = 0; offset < 800; offset += 100) {
        const r = await http(`${base}/api/3/contacts?limit=100&offset=${offset}`, { headers: { "Api-Token": creds["api_key"]! } });
        if (r.status >= 400) fail("ActiveCampaign", r);
        const rows: any[] = r.body?.contacts ?? [];
        for (const c of rows) contacts.push({ phone: c.phone, email: c.email, first_name: c.firstName, last_name: c.lastName });
        if (rows.length < 100) break;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "activecampaign");
    },
  },

  brevo: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const r = await http("https://api.brevo.com/v3/account", { headers: { "api-key": creds["api_key"]! } });
      if (r.status >= 400) fail("Brevo", r);
      return { accountLabel: r.body?.companyName ?? r.body?.email ?? "Brevo" };
    },
    sync: async (creds, ctx) => {
      const contacts: IncomingContact[] = [];
      for (let offset = 0; offset < 800; offset += 100) {
        const r = await http(`https://api.brevo.com/v3/contacts?limit=100&offset=${offset}`, {
          headers: { "api-key": creds["api_key"]! },
        });
        if (r.status >= 400) fail("Brevo", r);
        const rows: any[] = r.body?.contacts ?? [];
        for (const c of rows) {
          const a = c.attributes ?? {};
          contacts.push({ phone: a.SMS ?? a.PHONE ?? null, email: c.email, first_name: a.FIRSTNAME, last_name: a.LASTNAME });
        }
        if (rows.length < 100) break;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "brevo");
    },
  },

  pipedrive: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const r = await http(`https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(creds["api_key"]!)}`);
      if (r.status >= 400 || r.body?.success === false) fail("Pipedrive", r);
      return { accountLabel: r.body?.data?.company_name ?? "Pipedrive" };
    },
    sync: async (creds, ctx) => {
      const contacts: IncomingContact[] = [];
      for (let start = 0; start < 800; start += 100) {
        const r = await http(
          `https://api.pipedrive.com/v1/persons?limit=100&start=${start}&api_token=${encodeURIComponent(creds["api_key"]!)}`,
        );
        if (r.status >= 400) fail("Pipedrive", r);
        const rows: any[] = r.body?.data ?? [];
        for (const p of rows) {
          const [first, ...rest] = String(p.name ?? "").trim().split(/\s+/);
          contacts.push({
            phone: p.phone?.[0]?.value ?? null,
            email: p.email?.[0]?.value ?? null,
            first_name: first || null,
            last_name: rest.join(" ") || null,
          });
        }
        if (rows.length < 100) break;
      }
      return upsertContacts(ctx.db, ctx.accountId, contacts, "pipedrive");
    },
  },

  gohighlevel: {
    verify: async (creds) => {
      need(creds, ["access_token"]);
      const r = await http("https://services.leadconnectorhq.com/locations/search?limit=1", {
        headers: { authorization: `Bearer ${creds["access_token"]}`, Version: "2021-07-28", accept: "application/json" },
      });
      if (r.status >= 400) fail("GoHighLevel", r);
      return { accountLabel: r.body?.locations?.[0]?.name ?? "GoHighLevel" };
    },
    sync: async (creds, ctx) => {
      const loc = creds["location_id"];
      if (!loc) throw new Error("Add your GoHighLevel Location ID before syncing.");
      const r = await http(`https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(loc)}&limit=100`, {
        headers: { authorization: `Bearer ${creds["access_token"]}`, Version: "2021-07-28", accept: "application/json" },
      });
      if (r.status >= 400) fail("GoHighLevel", r);
      const contacts = (r.body?.contacts ?? []).map((c: any) => ({
        phone: c.phone,
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
      }));
      return upsertContacts(ctx.db, ctx.accountId, contacts, "gohighlevel");
    },
  },

  intercom: {
    verify: async (creds) => {
      need(creds, ["access_token"]);
      const r = await http("https://api.intercom.io/me", {
        headers: { authorization: `Bearer ${creds["access_token"]}`, accept: "application/json" },
      });
      if (r.status >= 400) fail("Intercom", r);
      return { accountLabel: r.body?.app?.name ?? r.body?.name ?? "Intercom" };
    },
    sync: async (creds, ctx) => {
      const r = await http("https://api.intercom.io/contacts?per_page=100", {
        headers: { authorization: `Bearer ${creds["access_token"]}`, accept: "application/json" },
      });
      if (r.status >= 400) fail("Intercom", r);
      const contacts = (r.body?.data ?? []).map((c: any) => {
        const [first, ...rest] = String(c.name ?? "").trim().split(/\s+/);
        return { phone: c.phone, email: c.email, first_name: first || null, last_name: rest.join(" ") || null };
      });
      return upsertContacts(ctx.db, ctx.accountId, contacts, "intercom");
    },
  },

  zendesk: {
    verify: async (creds) => {
      need(creds, ["subdomain", "email", "api_token"]);
      const basic = Buffer.from(`${creds["email"]}/token:${creds["api_token"]}`).toString("base64");
      const r = await http(`https://${cleanHost(creds["subdomain"]!).replace(/\.zendesk\.com$/, "")}.zendesk.com/api/v2/users/me.json`, {
        headers: { authorization: `Basic ${basic}` },
      });
      if (r.status >= 400) fail("Zendesk", r);
      return { accountLabel: r.body?.user?.name ?? "Zendesk" };
    },
  },

  notion: {
    verify: async (creds) => {
      need(creds, ["access_token"]);
      const r = await http("https://api.notion.com/v1/users/me", {
        headers: { authorization: `Bearer ${creds["access_token"]}`, "Notion-Version": "2022-06-28" },
      });
      if (r.status >= 400) fail("Notion", r);
      return { accountLabel: r.body?.name ?? r.body?.bot?.workspace_name ?? "Notion" };
    },
  },

  twilio: {
    verify: async (creds) => {
      need(creds, ["account_sid", "auth_token"]);
      const basic = Buffer.from(`${creds["account_sid"]}:${creds["auth_token"]}`).toString("base64");
      const r = await http(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds["account_sid"]!)}.json`, {
        headers: { authorization: `Basic ${basic}` },
      });
      if (r.status >= 400) fail("Twilio", r);
      return { accountId: r.body?.sid ?? null, accountLabel: r.body?.friendly_name ?? "Twilio" };
    },
  },

  openai: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const r = await http("https://api.openai.com/v1/models?limit=1", {
        headers: { authorization: `Bearer ${creds["api_key"]}` },
      });
      if (r.status >= 400) fail("OpenAI", r);
      return { accountLabel: "OpenAI" };
    },
  },
  claude: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const r = await http("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": creds["api_key"]!, "anthropic-version": "2023-06-01" },
      });
      if (r.status >= 400) fail("Claude", r);
      return { accountLabel: "Anthropic Claude" };
    },
  },
  gemini: {
    verify: async (creds) => {
      need(creds, ["api_key"]);
      const r = await http(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(creds["api_key"]!)}`);
      if (r.status >= 400) fail("Gemini", r);
      return { accountLabel: "Google Gemini" };
    },
  },

  slack: webhookRuntime("Slack", "webhook_url"),
  discord: webhookRuntime("Discord", "webhook_url"),
  webhooks: webhookRuntime("your endpoint", "endpoint"),
  zapier: webhookRuntime("Zapier", "endpoint"),
  make: webhookRuntime("Make", "endpoint"),
  n8n: webhookRuntime("n8n", "endpoint"),

  // ── Xellvio → Xellvio workspace link ────────────────────────────────────
  "xellvio-connect": {
    verify: async (creds, ctx) => {
      need(creds, ["workspace_key"]);
      const hash = hashWorkspaceKey(creds["workspace_key"]!);
      const { data: key } = await ctx.db
        .from("workspace_api_keys")
        .select("id, account_id, name, revoked_at")
        .eq("key_hash", hash)
        .maybeSingle();
      if (!key || key.revoked_at) throw new Error("That workspace key is not valid or has been revoked.");
      if (key.account_id === ctx.accountId) throw new Error("This key belongs to the workspace you are already in.");
      const { data: acct } = await ctx.db.from("accounts").select("id, name").eq("id", key.account_id).maybeSingle();
      await ctx.db.from("workspace_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
      return {
        accountId: key.account_id,
        accountLabel: acct?.name ?? "Linked Xellvio workspace",
        note: "Workspace key verified.",
      };
    },
    sync: async (_creds, ctx) => {
      const sourceId = String(ctx.settings["linked_account_id"] ?? "");
      if (!sourceId) throw new Error("This connection is not linked to a workspace yet. Reconnect it.");
      const { data: rows, error } = await ctx.db
        .from("profiles")
        .select("phone_e164, first_name, last_name")
        .eq("account_id", sourceId)
        .limit(5000);
      if (error) throw new Error(error.message);
      const contacts = (rows ?? []).map((p: any) => ({
        phone: p.phone_e164,
        first_name: p.first_name,
        last_name: p.last_name,
      }));
      return upsertContacts(ctx.db, ctx.accountId, contacts, "xellvio-connect");
    },
  },

  // ── Xellvio SMS: bind one of the workspace's verified numbers ────────────
  "xellvio-sms": {
    verify: async (_creds, ctx) => {
      const phone = String(ctx.settings["sender_number"] ?? "").trim();
      if (!phone) throw new Error("Choose one of your verified Xellvio numbers.");
      const { data: asset } = await ctx.db
        .from("sender_assets")
        .select("phone_number, verification_status, sender_kind, country_code")
        .eq("account_id", ctx.accountId)
        .eq("phone_number", phone)
        .maybeSingle();
      if (!asset) throw new Error("That number is not on this workspace.");
      if (asset.verification_status !== "verified") throw new Error("That number is not verified for sending yet.");
      return { accountId: phone, accountLabel: `${phone} (${asset.sender_kind ?? "number"})`, note: "Sending number verified." };
    },
    send: async (_creds, ctx, payload) => {
      const phone = String(ctx.settings["sender_number"] ?? "").trim();
      if (!payload.to) throw new Error("A destination number is required.");
      const { sendMessage, safeTelnyxCall } = await import("@/lib/telnyx.server");
      const { data: asset } = await ctx.db
        .from("sender_assets")
        .select("phone_number, telnyx_messaging_profile_id, verification_status")
        .eq("account_id", ctx.accountId)
        .eq("phone_number", phone)
        .maybeSingle();
      if (!asset || asset.verification_status !== "verified") throw new Error("The connected number is no longer available for sending.");
      await safeTelnyxCall(
        "app_send",
        { userId: ctx.accountId, messagingProfileId: asset.telnyx_messaging_profile_id ?? null },
        () =>
          sendMessage({
            to: payload.to!,
            text: payload.text,
            from: asset.phone_number ?? undefined,
            messagingProfileId: asset.telnyx_messaging_profile_id ?? undefined,
          }),
      );
      return { ok: true as const };
    },
  },
};

function safeJson(text: string): any {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Shopify cursor pagination lives in the Link header. */
function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1]!;
  }
  return null;
}

export function hashWorkspaceKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

export function runtimeFor(slug: string): ProviderRuntime | null {
  return RUNTIMES[slug] ?? null;
}
