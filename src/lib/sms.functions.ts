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
    if (!acct?.twilio_subaccount_sid || !acct.twilio_subaccount_auth_token_enc) {
      throw new Error("Your SMS sender isn't set up yet. Finish the Set up SMS wizard first.");
    }

    let assetQ = supabase
      .from("sender_assets")
      .select("messaging_service_sid,phone_number,sender_kind,country_code,verification_status")
      .eq("account_id", userId);
    if (data.country) assetQ = assetQ.eq("country_code", data.country.toUpperCase());

    const { data: assets } = await assetQ;
    // Prefer a verified sender; else fall back to any with a messaging_service_sid
    const asset =
      (assets ?? []).find((a) => a.verification_status === "verified" && a.messaging_service_sid) ||
      (assets ?? []).find((a) => !!a.messaging_service_sid);
    if (!asset?.messaging_service_sid) {
      throw new Error(
        data.country
          ? `No sender provisioned for ${data.country.toUpperCase()} yet. Wait for setup to finish or pick another country.`
          : "No active sender yet. Wait for setup to finish.",
      );
    }

    const subSid = acct.twilio_subaccount_sid;
    const subToken = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);

    const body = new URLSearchParams({
      To: data.to,
      MessagingServiceSid: asset.messaging_service_sid,
      Body: data.body,
    });
    const res = await fetch(`${TWILIO_API}/Accounts/${subSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(subSid, subToken),
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
