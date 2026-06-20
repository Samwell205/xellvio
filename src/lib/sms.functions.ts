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

export const TEST_SEND_DAILY_LIMIT = 5;

function startOfUtcDayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export const getTestSendUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = startOfUtcDayIso();
    const { count } = await supabase
      .from("campaign_test_sends")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    const used = count ?? 0;
    const reset = new Date();
    reset.setUTCHours(24, 0, 0, 0);
    return {
      used,
      limit: TEST_SEND_DAILY_LIMIT,
      remaining: Math.max(0, TEST_SEND_DAILY_LIMIT - used),
      resetsAt: reset.toISOString(),
    };
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TestSendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { decryptToken } = await import("./tenant-crypto.server");

    // Enforce per-user daily test-send limit
    const sinceDay = startOfUtcDayIso();
    const { count: usedToday } = await supabase
      .from("campaign_test_sends")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceDay);
    if ((usedToday ?? 0) >= TEST_SEND_DAILY_LIMIT) {
      throw new Error(`Daily test limit reached (${TEST_SEND_DAILY_LIMIT}/day). Try again tomorrow (resets 00:00 UTC).`);
    }


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
        .from("country_rates_public")
        .select("country_code,dial_prefix")
        .eq("active", true);
      const { countryFromPhone } = await import("./country-from-phone");
      countryCode = countryFromPhone(data.to, (rates ?? []) as any) ?? undefined;
    }

    const { data: allAssets, error: assetsError } = await supabase
      .from("sender_assets")
      .select("messaging_service_sid,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", userId);
    if (assetsError) throw new Error(assetsError.message);

    // Use only verified senders. If the test recipient country is known, never fall back
    // to another country's sender because carriers require country-appropriate routing.
    function rank(a: any) {
      let s = 0;
      if (countryCode && a.country_code === countryCode) s += 1000;
      if (a.phone_number) s += 100;          // real number is safest
      if (a.messaging_service_sid) s += 80;  // service routes around trial limits
      if (a.sender_kind !== "sender_id") s += 20;
      return s;
    }
    const eligible = [...(allAssets ?? [])].filter(
      (a) => a.verification_status === "verified" && (a.messaging_service_sid || a.phone_number),
    );
    const countryEligible = countryCode
      ? eligible.filter((a) => a.country_code === countryCode)
      : eligible;
    const ranked = countryEligible
      .sort((x, y) => rank(y) - rank(x));
    const asset = ranked[0];
    if (!asset) {
      throw new Error(
        countryCode
          ? `No verified sender is available for ${countryCode}. Use your approved ${countryCode} number or set up a sender for that country before testing.`
          : "No verified sender is available yet. Finish SMS setup before testing.",
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
    // Prefer MessagingService when available; otherwise use the approved sender value.
    if (asset.messaging_service_sid) {
      body.set("MessagingServiceSid", asset.messaging_service_sid);
    } else if (asset.sender_kind !== "sender_id" && asset.phone_number) {
      body.set("From", asset.phone_number);
    } else if (asset.sender_kind === "sender_id" && asset.phone_number && !["US", "CA"].includes(asset.country_code)) {
      body.set("From", asset.phone_number);
    } else {
      throw new Error(
        "This country requires a real approved sending number. Request or approve a phone number, then retry.",
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
      if (json?.code === 21608 || String(json?.message ?? "").toLowerCase().includes("trial accounts cannot send")) {
        throw new Error(
          "Your approved sending number is ready, but the SMS provider account is still in trial mode. Trial mode can only send tests to provider-verified recipient phones. Verify this test recipient in the provider account or upgrade the SMS provider account before launching real campaigns.",
        );
      }
      throw new Error(json?.message ?? `Twilio error ${res.status}`);
    }
    // Log the successful test send for daily-limit accounting
    await supabase.from("campaign_test_sends").insert({
      user_id: userId,
      to_phone: data.to,
      twilio_sid: (json?.sid as string) ?? null,
    });
    return {
      sid: json.sid as string,
      status: json.status as string,
      from: (asset.phone_number ?? asset.messaging_service_sid) as string,
      sender_kind: asset.sender_kind as string,
      country: asset.country_code as string,
    };
  });
