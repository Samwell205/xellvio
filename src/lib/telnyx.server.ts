// Telnyx REST client + provisioning helpers. Server-only.
// All app SMS sending, number provisioning, and Messaging Profile management
// goes through this module. No Twilio anywhere.

const TELNYX_API = "https://api.telnyx.com/v2";

function apiKey(): string {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error("TELNYX_API_KEY is not configured");
  return key;
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "https://xellvio.com").replace(/\/$/, "");
}

export function statusWebhookUrl(): string {
  return `${publicBaseUrl()}/api/public/telnyx-status`;
}
export function inboundWebhookUrl(): string {
  return `${publicBaseUrl()}/api/public/telnyx-inbound`;
}

type TelnyxOpts = { method?: string; body?: any; query?: Record<string, string | number | undefined> };

async function telnyx<T = any>(path: string, opts: TelnyxOpts = {}): Promise<T> {
  const method = opts.method ?? "GET";
  let url = `${TELNYX_API}${path}`;
  if (opts.query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    }
    const s = q.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const first = json?.errors?.[0];
    const detail = first?.detail || first?.title || json?.error || text.slice(0, 300);
    const err = new Error(`Telnyx ${res.status}: ${detail}`);
    (err as any).telnyxStatus = res.status;
    (err as any).telnyxCode = first?.code ?? null;
    (err as any).telnyxResponse = json;
    throw err;
  }
  return json as T;
}

// ============ Messaging Profiles (per-tenant isolation) ============

export type MessagingProfile = { id: string; name: string; enabled: boolean; webhook_url?: string | null };

// Broad set of ISO-2 country codes we allow tenants to send SMS to. Telnyx
// requires whitelisted_destinations to be non-empty or it rejects sends with
// "Messaging profile is missing whitelisted destinations".
export const DEFAULT_WHITELISTED_DESTINATIONS = [
  "US","CA","GB","IE","AU","NZ","DE","FR","ES","IT","PT","NL","BE","LU","CH","AT",
  "DK","SE","NO","FI","IS","PL","CZ","SK","HU","RO","BG","GR","HR","SI","EE","LV","LT",
  "MT","CY","TR","UA","RU","IL","AE","SA","QA","KW","BH","OM","JO","LB","EG",
  "ZA","NG","KE","GH","UG","TZ","RW","CI","SN","CM","MA","DZ","TN","ET",
  "IN","PK","BD","LK","NP","MY","SG","TH","VN","ID","PH","JP","KR","HK","TW",
  "MX","BR","AR","CL","CO","PE","VE","EC","UY","PY","BO","CR","GT","PA","DO","PR",
];

export function isValidTelnyxUuid(id: string | null | undefined): id is string {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function createMessagingProfile(name: string): Promise<MessagingProfile> {
  const res = await telnyx<{ data: MessagingProfile }>("/messaging_profiles", {
    method: "POST",
    body: {
      name: name.slice(0, 128),
      enabled: true,
      webhook_url: statusWebhookUrl(),
      webhook_failover_url: null,
      webhook_api_version: "2",
      whitelisted_destinations: DEFAULT_WHITELISTED_DESTINATIONS,
    },
  });
  return res.data;
}

export async function updateMessagingProfileWhitelist(id: string, countries: string[] = DEFAULT_WHITELISTED_DESTINATIONS): Promise<void> {
  await telnyx(`/messaging_profiles/${id}`, {
    method: "PATCH",
    body: { whitelisted_destinations: countries, webhook_url: statusWebhookUrl(), webhook_api_version: "2" },
  });
}

export async function getMessagingProfile(id: string): Promise<MessagingProfile | null> {
  if (!isValidTelnyxUuid(id)) return null;
  try {
    const res = await telnyx<{ data: MessagingProfile }>(`/messaging_profiles/${id}`);
    return res.data;
  } catch (e: any) {
    if (e.telnyxStatus === 404) return null;
    throw e;
  }
}

// ============ Numbers ============

export type AvailableNumber = {
  phone_number: string;
  region_information?: Array<{ region_type: string; region_name: string }>;
  cost_information?: { upfront_cost: string; monthly_cost: string; currency: string };
  best_effort?: boolean;
  features?: Array<{ name: string }>;
  vanity_format?: string | null;
};

export async function searchAvailableNumbers(opts: {
  country: string;
  numberType?: "local" | "toll-free" | "mobile" | "national";
  areaCode?: string;
  limit?: number;
}): Promise<AvailableNumber[]> {
  const q: Record<string, string | number> = {
    "filter[country_code]": opts.country.toUpperCase(),
    "filter[features][]": "sms",
    "filter[best_effort]": "true",
    "filter[limit]": Math.min(opts.limit ?? 20, 50),
  };
  if (opts.numberType) q["filter[phone_number_type]"] = opts.numberType;
  if (opts.areaCode) q["filter[national_destination_code]"] = opts.areaCode;
  const res = await telnyx<{ data: AvailableNumber[] }>("/available_phone_numbers", { query: q });
  return res.data ?? [];
}

export type OrderedNumber = {
  id: string;
  phone_number: string;
  status: string;
};
export type NumberOrder = {
  id: string;
  status: string;
  phone_numbers: OrderedNumber[];
};

export async function orderNumber(opts: {
  phoneNumber: string;
  messagingProfileId: string;
}): Promise<NumberOrder> {
  const res = await telnyx<{ data: NumberOrder }>("/number_orders", {
    method: "POST",
    body: {
      phone_numbers: [{ phone_number: opts.phoneNumber }],
      messaging_profile_id: opts.messagingProfileId,
    },
  });
  return res.data;
}

export async function getPhoneNumberByE164(phone: string): Promise<{ id: string; phone_number: string; messaging_profile_id: string | null } | null> {
  const res = await telnyx<{ data: Array<{ id: string; phone_number: string; messaging_profile_id: string | null }> }>(
    "/phone_numbers",
    { query: { "filter[phone_number]": phone } },
  );
  return res.data?.[0] ?? null;
}

/** Reassign an already-owned number to a different Messaging Profile. */
export async function reassignNumberToProfile(opts: {
  phoneNumberId: string;
  messagingProfileId: string;
}): Promise<void> {
  await telnyx(`/phone_numbers/messaging/${opts.phoneNumberId}`, {
    method: "PATCH",
    body: { messaging_profile_id: opts.messagingProfileId },
  });
}

// ============ Messages ============

export type SendMessageResult = { id: string; to: Array<{ phone_number: string; status: string }>; parts?: number };

export async function sendMessage(opts: {
  to: string;
  text: string;
  from?: string;
  messagingProfileId?: string;
  mediaUrls?: string[];
  webhookUrl?: string;
}): Promise<SendMessageResult> {
  const body: any = {
    to: opts.to,
    text: opts.text,
    webhook_url: opts.webhookUrl ?? statusWebhookUrl(),
    use_profile_webhooks: false,
  };
  if (opts.from) body.from = opts.from;
  if (opts.messagingProfileId) body.messaging_profile_id = opts.messagingProfileId;
  if (opts.mediaUrls && opts.mediaUrls.length) body.media_urls = opts.mediaUrls;
  const res = await telnyx<{ data: SendMessageResult }>("/messages", { method: "POST", body });
  return res.data;
}

export async function getMessage(id: string): Promise<any> {
  const res = await telnyx<{ data: any }>(`/messages/${id}`);
  return res.data;
}

// ============ Balance ============

export async function getBalance(): Promise<{ balance: number; currency: string; ok: boolean; error?: string }> {
  try {
    const res = await telnyx<{ data: { balance: string; currency: string; credit_limit?: string; available_credit?: string } }>("/balance");
    return { balance: Number(res.data.balance ?? res.data.available_credit ?? 0), currency: res.data.currency || "USD", ok: true };
  } catch (e: any) {
    return { balance: 0, currency: "USD", ok: false, error: e?.message ?? String(e) };
  }
}

// ============ Status mapping ============

/**
 * Map a Telnyx delivery status (from webhook payload or Get Message API)
 * to our internal enum. Internal enum is unchanged.
 */
export function mapTelnyxStatus(raw: string | undefined | null): "queued" | "sending" | "sent" | "delivered" | "undelivered" | "failed" {
  const s = (raw ?? "").toLowerCase();
  if (s === "delivered") return "delivered";
  if (s === "sending_failed" || s === "sending failed") return "failed";
  if (s === "delivery_failed" || s === "delivery failed") return "undelivered";
  if (s === "delivery_unconfirmed" || s === "sent") return "sent";
  if (s === "sending") return "sending";
  if (s === "queued" || s === "pending" || s === "accepted") return "queued";
  return "sent";
}

// ============ Telnyx-specific error codes indicating prohibited content ============

export function isShaftLikeTelnyxError(code: string | number | null | undefined): boolean {
  if (!code) return false;
  const c = String(code);
  // 40010 blocked by carrier, 40011 content filter, 40001 destination blocked
  return ["40010", "40011", "40001", "40012"].includes(c);
}

// ============ Provisioning ensure-helper ============

/**
 * Ensure the given account has a Telnyx Messaging Profile. Idempotent.
 * Stores id in accounts.telnyx_messaging_profile_id (and legacy
 * twilio_subaccount_sid for backwards compat with existing selects).
 */
export async function ensureMessagingProfileForAccount(accountId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: acct, error } = await supabaseAdmin
    .from("accounts")
    .select("id, legal_business_name, email, telnyx_messaging_profile_id, twilio_subaccount_sid")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !acct) throw new Error("Account not found");

  const existing = acct.telnyx_messaging_profile_id ?? acct.twilio_subaccount_sid ?? null;
  if (existing && existing.startsWith("40")) {
    // Telnyx messaging profile IDs are UUIDs beginning with "40..." for some
    // resources; simpler: just verify by fetching.
    const p = await getMessagingProfile(existing);
    if (p) {
      if (!acct.telnyx_messaging_profile_id) {
        await supabaseAdmin
          .from("accounts")
          .update({ telnyx_messaging_profile_id: existing, telnyx_messaging_profile_created_at: new Date().toISOString() })
          .eq("id", accountId);
      }
      return existing;
    }
  }

  const name = (acct.legal_business_name || acct.email || `Tenant ${accountId.slice(0, 8)}`).slice(0, 120);
  const profile = await createMessagingProfile(`Xellvio · ${name}`);
  await supabaseAdmin
    .from("accounts")
    .update({
      telnyx_messaging_profile_id: profile.id,
      telnyx_messaging_profile_created_at: new Date().toISOString(),
      // Mirror into legacy columns so untouched code paths still work.
      twilio_subaccount_sid: profile.id,
      onboarding_status: "sender_pending",
    })
    .eq("id", accountId);
  return profile.id;
}

// ============ Wrapped-call helper with tenant-aware logging ============

export async function safeTelnyxCall<T>(
  op: string,
  ctx: { userId?: string | null; messagingProfileId?: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    console.error(
      `[telnyx] ${op} failed`,
      JSON.stringify({
        userId: ctx.userId ?? null,
        messagingProfileId: ctx.messagingProfileId ?? null,
        status: e?.telnyxStatus ?? null,
        code: e?.telnyxCode ?? null,
        message: e?.message ?? String(e),
      }),
    );
    throw e;
  }
}
