import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

const TestSendSchema = z.object({
  to: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Phone must be E.164, e.g. +15551234567"),
  body: z.string().trim().min(1).max(1600),
  country: z.string().length(2).optional(),
});

function basicAuth(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function mainSmsAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("SMS provider credentials are not configured");
  return { sid, token };
}

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TestSendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { decryptToken } = await import("./tenant-crypto.server");

    // Load this tenant's own Twilio subaccount + sender
    const { data: acct } = await supabase
      .from("accounts")
      .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
      .eq("id", userId)
      .maybeSingle();
    // Derive recipient country from To if not provided
    let countryCode = data.country?.toUpperCase();
    if (!countryCode) {
      const { data: rates } = await supabase
        .from("country_rates")
        .select("country_code,dial_prefix")
        .eq("active", true);
      const { countryFromPhone } = await import("./country-from-phone");
      countryCode = countryFromPhone(data.to, (rates ?? []) as any) ?? undefined;
    }

    const { data: allAssets } = await supabase
      .from("sender_assets")
      .select("messaging_service_sid,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", userId);

    // Ranking: country match > verified > has phone/messaging_service > sender_kind preference.
    // Avoid alphanumeric Sender ID for "From" (Twilio trial subaccounts reject it).
    function rank(a: any) {
      let s = 0;
      if (countryCode && a.country_code === countryCode) s += 1000;
      if (a.verification_status === "verified") s += 500;
      if (a.phone_number) s += 100;          // real number is safest
      if (a.messaging_service_sid) s += 80;  // service routes around trial limits
      if (a.sender_kind !== "sender_id") s += 20;
      return s;
    }
    const ranked = [...(allAssets ?? [])]
      .filter((a) => a.messaging_service_sid || a.phone_number)
      .sort((x, y) => rank(y) - rank(x));
    const asset = ranked[0];
    if (!asset) {
      throw new Error(
        countryCode
          ? `No sender provisioned for ${countryCode} yet. Wait for setup to finish or pick another country.`
          : "No active sender yet. Wait for setup to finish.",
      );
    }

    let accountAuth = mainSmsAuth();
    if (acct?.twilio_subaccount_sid && acct.twilio_subaccount_auth_token_enc) {
      try {
        accountAuth = {
          sid: acct.twilio_subaccount_sid,
          token: decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string),
        };
      } catch {
        accountAuth = mainSmsAuth();
      }
    }

    const body = new URLSearchParams({
      To: data.to,
      Body: data.body,
    });
    // Prefer MessagingService when available; only fall back to From=<phone> when it's a real phone.
    if (asset.messaging_service_sid) {
      body.set("MessagingServiceSid", asset.messaging_service_sid);
    } else if (asset.sender_kind !== "sender_id" && asset.phone_number) {
      body.set("From", asset.phone_number);
    } else {
      throw new Error(
        "Your only verified sender is an Alphanumeric Sender ID, which Twilio trial accounts can't use as the From number. Approve a phone number (US/CA) or upgrade the Twilio subaccount, then retry.",
      );
    }
    const res = await fetch(`${TWILIO_API}/Accounts/${accountAuth.sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(accountAuth.sid, accountAuth.token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message ?? `Twilio error ${res.status}`);
    }
    return {
      sid: json.sid as string,
      status: json.status as string,
      from: asset.phone_number as string,
      sender_kind: asset.sender_kind as string,
      country: asset.country_code as string,
    };
  });
