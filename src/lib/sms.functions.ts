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
    let assetQ = supabase
      .from("sender_assets")
      .select("messaging_service_sid,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", userId);
    if (data.country) assetQ = assetQ.eq("country_code", data.country.toUpperCase());

    const { data: assets } = await assetQ;
    // Prefer a verified sender; else fall back to any saved sender.
    const asset =
      (assets ?? []).find((a) => a.verification_status === "verified" && (a.messaging_service_sid || a.phone_number)) ||
      (assets ?? []).find((a) => !!a.messaging_service_sid || !!a.phone_number);
    if (!asset?.messaging_service_sid && !asset?.phone_number) {
      throw new Error(
        data.country
          ? `No sender provisioned for ${data.country.toUpperCase()} yet. Wait for setup to finish or pick another country.`
          : "No active sender yet. Wait for setup to finish.",
      );
    }

    let accountAuth = mainSmsAuth();
    if (acct?.twilio_subaccount_sid && acct.twilio_subaccount_auth_token_enc) {
      try {
        accountAuth = { sid: acct.twilio_subaccount_sid, token: decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string) };
      } catch {
        accountAuth = mainSmsAuth();
      }
    }

    const body = new URLSearchParams({
      To: data.to,
      Body: data.body,
    });
    if (asset.messaging_service_sid) body.set("MessagingServiceSid", asset.messaging_service_sid);
    else body.set("From", asset.phone_number!);
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
