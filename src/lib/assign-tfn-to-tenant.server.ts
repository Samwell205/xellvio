// Wire a Twilio-approved toll-free number to a tenant so it can actually send SMS.
// Called by both admin assign flows (marketplace pool + Twilio approved list).
//
// Steps:
//   1) Look up the IncomingPhoneNumber SID on Twilio (by phone number).
//   2) Create a MessagingService in the main Twilio account with our webhooks.
//   3) Attach the phone number SID to that MessagingService.
//   4) Upsert sender_assets so the tenant sees it as a verified sender.
//   5) Mark the tenant account active with this number as the default sender.

const TWILIO_API = "https://api.twilio.com/2010-04-01";
const MESSAGING_API = "https://messaging.twilio.com/v1";

function basic(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilio<T = any>(
  url: string,
  opts: { method?: string; sid: string; token: string; body?: Record<string, string> },
): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: basic(opts.sid, opts.token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (opts.body) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.body)) p.append(k, v);
    init.body = p.toString();
  }
  const res = await fetch(url, init);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${json?.message ?? "request failed"}`);
  }
  return json as T;
}

export async function wireAssignedTollfreeForTenant(opts: {
  accountId: string;
  phoneNumber: string;
  countryCode?: string;
}): Promise<{ phone_sid: string | null; messaging_service_sid: string | null }> {
  const country = (opts.countryCode ?? "US").toUpperCase();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials are not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Look up phone SID
  let phoneSid: string | null = null;
  try {
    const list = await twilio<{ incoming_phone_numbers: Array<{ sid: string; phone_number: string }> }>(
      `${TWILIO_API}/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(opts.phoneNumber)}`,
      { sid, token },
    );
    phoneSid = list.incoming_phone_numbers?.[0]?.sid ?? null;
  } catch (e) {
    console.warn("[assign-tfn] IncomingPhoneNumbers lookup failed", e);
  }

  // 2) Create MessagingService + 3) attach number
  const base = process.env.PUBLIC_BASE_URL ?? "https://xellvio.com";
  let msSid: string | null = null;
  try {
    const ms = await twilio<{ sid: string }>(`${MESSAGING_API}/Services`, {
      method: "POST",
      sid,
      token,
      body: {
        FriendlyName: `Tenant ${opts.accountId.slice(0, 8)} ${country} TF`.slice(0, 64),
        InboundRequestUrl: `${base}/api/public/twilio-inbound`,
        StatusCallback: `${base}/api/public/twilio-status`,
      },
    });
    msSid = ms.sid;
    if (phoneSid) {
      try {
        await twilio(`${MESSAGING_API}/Services/${msSid}/PhoneNumbers`, {
          method: "POST",
          sid,
          token,
          body: { PhoneNumberSid: phoneSid },
        });
      } catch (e) {
        console.warn("[assign-tfn] attach number to service failed", e);
      }
    }
  } catch (e) {
    console.warn("[assign-tfn] create MessagingService failed", e);
  }

  // 4) Upsert sender_assets
  const { data: existing } = await supabaseAdmin
    .from("sender_assets")
    .select("id")
    .eq("account_id", opts.accountId)
    .eq("country_code", country)
    .eq("sender_kind", "toll_free")
    .maybeSingle();

  const row = {
    account_id: opts.accountId,
    country_code: country,
    sender_kind: "toll_free",
    phone_number: opts.phoneNumber,
    phone_sid: phoneSid,
    messaging_service_sid: msSid,
    verification_status: "verified",
    last_synced_at: new Date().toISOString(),
  } as const;

  if (existing?.id) {
    await supabaseAdmin.from("sender_assets").update(row).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("sender_assets").insert(row);
  }

  // 5) Activate tenant account with this sender as default
  await supabaseAdmin
    .from("accounts")
    .update({
      subaccount_phone_number: opts.phoneNumber,
      subaccount_phone_sid: phoneSid,
      subaccount_messaging_service_sid: msSid,
      onboarding_status: "active",
    })
    .eq("id", opts.accountId);

  return { phone_sid: phoneSid, messaging_service_sid: msSid };
}

export async function unwireAssignedTollfreeForTenant(opts: { phoneNumber: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: asset } = await supabaseAdmin
    .from("sender_assets")
    .select("id,account_id,messaging_service_sid")
    .eq("phone_number", opts.phoneNumber)
    .maybeSingle();
  if (!asset) return;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (asset.messaging_service_sid && sid && token) {
    try {
      await fetch(`${MESSAGING_API}/Services/${asset.messaging_service_sid}`, {
        method: "DELETE",
        headers: { Authorization: basic(sid, token) },
      });
    } catch (e) {
      console.warn("[unwire-tfn] delete service failed", e);
    }
  }
  await supabaseAdmin.from("sender_assets").delete().eq("id", asset.id);
  await supabaseAdmin
    .from("accounts")
    .update({
      subaccount_phone_number: null,
      subaccount_phone_sid: null,
      subaccount_messaging_service_sid: null,
    })
    .eq("id", asset.account_id)
    .eq("subaccount_phone_number", opts.phoneNumber);
}
