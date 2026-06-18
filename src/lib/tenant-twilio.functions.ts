import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function masterAuth(): { sid: string; token: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio master credentials not configured");
  return { sid, token };
}

function basicAuth(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilio<T = any>(path: string, opts: { method?: string; sid: string; token: string; body?: Record<string, string> }): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: basicAuth(opts.sid, opts.token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (opts.body) init.body = new URLSearchParams(opts.body).toString();
  const res = await fetch(`${TWILIO_API}${path}`, init);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${json?.message ?? "request failed"}`);
  return json as T;
}

/** Provision a Twilio subaccount for the current tenant. Idempotent. */
export const provisionSubaccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { encryptToken } = await import("./tenant-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct, error } = await supabase
      .from("accounts")
      .select("id,legal_business_name,onboarding_status,twilio_subaccount_sid")
      .eq("id", userId)
      .maybeSingle();
    if (error || !acct) throw new Error("Account not found");
    if (acct.onboarding_status === "suspended") throw new Error("Account suspended");
    if (!acct.legal_business_name) throw new Error("Complete your business profile first");
    if (acct.twilio_subaccount_sid) return { subaccount_sid: acct.twilio_subaccount_sid, already: true };

    const master = masterAuth();
    const sub = await twilio<{ sid: string; auth_token: string }>("/Accounts.json", {
      method: "POST",
      sid: master.sid,
      token: master.token,
      body: { FriendlyName: `${acct.legal_business_name} (tenant:${userId.slice(0, 8)})` },
    });

    const enc = encryptToken(sub.auth_token);
    const { error: upErr } = await supabaseAdmin
      .from("accounts")
      .update({
        twilio_subaccount_sid: sub.sid,
        twilio_subaccount_auth_token_enc: enc as any,
        onboarding_status: "sender_pending",
      })
      .eq("id", userId);
    if (upErr) throw upErr;
    return { subaccount_sid: sub.sid, already: false };
  });

/** Search available phone numbers in a country, using the tenant subaccount. */
export const searchNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { country: string; smsEnabled?: boolean }) =>
    z.object({ country: z.string().length(2), smsEnabled: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { decryptToken } = await import("./tenant-crypto.server");

    const { data: acct } = await supabase
      .from("accounts")
      .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
      .eq("id", userId)
      .maybeSingle();
    if (!acct?.twilio_subaccount_sid || !acct.twilio_subaccount_auth_token_enc) {
      throw new Error("Provision your subaccount first");
    }
    const token = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);

    const list = await twilio<{ available_phone_numbers: Array<{ phone_number: string; friendly_name: string; locality?: string; region?: string; capabilities: { SMS: boolean; MMS: boolean; voice: boolean } }> }>(
      `/Accounts/${acct.twilio_subaccount_sid}/AvailablePhoneNumbers/${data.country.toUpperCase()}/Local.json?SmsEnabled=true&PageSize=10`,
      { sid: acct.twilio_subaccount_sid, token },
    );
    return list.available_phone_numbers ?? [];
  });

/** Purchase a phone number on the tenant's subaccount and save it. */
export const purchaseNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phoneNumber: string }) =>
    z.object({ phoneNumber: z.string().regex(/^\+\d{6,15}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { decryptToken } = await import("./tenant-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct } = await supabase
      .from("accounts")
      .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc,subaccount_phone_sid")
      .eq("id", userId)
      .maybeSingle();
    if (!acct?.twilio_subaccount_sid || !acct.twilio_subaccount_auth_token_enc) {
      throw new Error("Provision your subaccount first");
    }
    if (acct.subaccount_phone_sid) throw new Error("A number is already provisioned for this account");
    const token = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);

    const base = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";
    const result = await twilio<{ sid: string; phone_number: string }>(
      `/Accounts/${acct.twilio_subaccount_sid}/IncomingPhoneNumbers.json`,
      {
        method: "POST",
        sid: acct.twilio_subaccount_sid,
        token,
        body: {
          PhoneNumber: data.phoneNumber,
          SmsUrl: `${base}/api/public/twilio-inbound`,
          StatusCallback: `${base}/api/public/twilio-status`,
        },
      },
    );

    const { error: upErr } = await supabaseAdmin
      .from("accounts")
      .update({
        subaccount_phone_number: result.phone_number,
        subaccount_phone_sid: result.sid,
        onboarding_status: "active",
      })
      .eq("id", userId);
    if (upErr) throw upErr;
    return { phone_number: result.phone_number, sid: result.sid };
  });
