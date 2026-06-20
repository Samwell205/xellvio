import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TWILIO_API = "https://api.twilio.com/2010-04-01";
const MESSAGING_API = "https://messaging.twilio.com/v1";

function masterAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("SMS provider credentials are not configured");
  return { sid, token };
}

function basic(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilio<T = any>(
  url: string,
  opts: { method?: string; sid: string; token: string; body?: Record<string, string | string[]> },
): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: basic(opts.sid, opts.token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (opts.body) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.body)) {
      if (Array.isArray(v)) for (const x of v) params.append(k, x);
      else params.append(k, v);
    }
    init.body = params.toString();
  }
  const res = await fetch(url, init);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message ?? `Carrier API ${res.status}`);
    (err as any).twilioCode = json?.code;
    (err as any).twilioStatus = res.status;
    (err as any).twilioMore = json?.more_info;
    throw err;
  }
  return json as T;
}

function friendlyReason(raw: string | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (!t) return "The carrier hasn't returned a specific reason yet.";
  if (t.includes("privacy")) return "Your website needs a visible Privacy Policy link.";
  if (t.includes("terms")) return "Your website needs a visible Terms of Service link.";
  if (t.includes("opt") || t.includes("consent"))
    return "We need clearer proof of how subscribers opt in. Add a screenshot or public URL of your sign-up form.";
  if (t.includes("sample") || t.includes("message"))
    return "Your sample message needs revision so it matches what carriers expect.";
  if (t.includes("website") || t.includes("url"))
    return "Your business website couldn't be reached. Double-check the URL.";
  if (t.includes("address"))
    return "The business address couldn't be verified. Check it for typos.";
  if (t.includes("name") || t.includes("entity"))
    return "The legal business name doesn't match a verifiable registration.";
  return raw!;
}

const VOLUME_VALUES = [
  "10",
  "100",
  "1,000",
  "10,000",
  "100,000",
  "250,000",
  "500,000",
  "750,000",
  "1,000,000",
  "5,000,000+",
] as const;

const OPT_IN_VALUES = [
  "VERBAL",
  "WEB_FORM",
  "PAPER_FORM",
  "VIA_TEXT",
  "MOBILE_QR_CODE",
] as const;

const USE_CASE_CATEGORIES = [
  "2FA",
  "APP_DELIVERY",
  "APPOINTMENTS",
  "AUCTION",
  "AUTO_REPAIR_SERVICES",
  "BANK_TRANSFERS",
  "BILLING",
  "BOOKING_CONFIRMATIONS",
  "BUSINESS_UPDATES",
  "COVID_19_ALERTS",
  "CONVERSATIONAL_ALERTS",
  "DELIVERY_NOTIFICATIONS",
  "EVENTS",
  "FRAUD_ALERTS",
  "FUNDRAISING",
  "GENERAL_MARKETING",
  "GENERAL_SCHOOL_UPDATES",
  "HEALTHCARE_ALERTS",
  "HOUSING_COMMUNITY_UPDATES",
  "INSURANCE_UPDATES",
  "JOB_DISPATCH",
  "LEGAL_NOTIFICATIONS",
  "MIXED",
  "NOTARY",
  "ORDER_NOTIFICATIONS",
  "PERSONAL",
  "POLITICAL",
  "PUBLIC_SERVICE_ANNOUNCEMENT",
  "REAL_ESTATE",
  "RELIGIOUS",
  "REPAIR_AND_DIAGNOSTICS",
  "REWARDS_PROGRAM",
  "SECURITY_ALERTS",
  "SOCIAL",
  "SWEEPSTAKE",
  "SYSTEM_ALERTS",
  "VOTING_REMINDERS",
  "WAITLIST",
  "WEBINAR",
  "WORKSHOP",
  "CHARITY_NONPROFIT",
] as const;

export const TollfreeVerificationInput = z.object({
  legalEntityName: z.string().trim().min(2).max(255),
  businessDba: z.string().trim().max(255).optional(),
  websiteUrl: z.string().trim().url(),
  businessType: z.string().trim().min(2).max(64),
  contactFirstName: z.string().trim().min(1).max(64),
  contactLastName: z.string().trim().min(1).max(64),
  contactEmail: z.string().trim().email(),
  contactPhoneCountry: z.string().trim().regex(/^\+\d{1,4}$/),
  contactPhone: z.string().trim().min(5).max(20),
  // Business location
  businessCountry: z.string().trim().length(2).default("US"),
  addressLine1: z.string().trim().min(2).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  zip: z.string().trim().min(3).max(20),
  // Use case
  monthlyVolume: z.enum(VOLUME_VALUES),
  optInType: z.enum(OPT_IN_VALUES),
  useCaseCategories: z.array(z.enum(USE_CASE_CATEGORIES)).min(1).max(5),
  proofOfOptInUrl: z.string().trim().url().optional().or(z.literal("")),
  useCaseDescription: z.string().trim().min(40).max(2000),
  sampleMessage: z.string().trim().min(20).max(1600),
  notificationEmail: z.string().trim().email(),
  additionalInformation: z.string().trim().max(2000).optional(),
  optInConfirmationMessage: z.string().trim().max(1600).optional(),
  helpMessageSample: z.string().trim().max(1600).optional(),
  privacyPolicyUrl: z.string().trim().url().optional().or(z.literal("")),
  termsUrl: z.string().trim().url().optional().or(z.literal("")),
  optInKeywords: z.string().trim().max(500).optional(),
  containsAgeGatedContent: z.boolean().default(false),
  agreeToTos: z.literal(true),
});

export type TollfreeVerificationPayload = z.infer<typeof TollfreeVerificationInput>;

function mapStatus(raw: string | undefined): "submitted" | "in_review" | "verified" | "rejected" {
  const t = (raw ?? "").toUpperCase();
  if (t === "APPROVED" || t === "TWILIO_APPROVED") return "verified";
  if (t === "REJECTED" || t === "TWILIO_REJECTED") return "rejected";
  if (t === "IN_REVIEW") return "in_review";
  return "submitted";
}

async function getOrBuyUsTollfree(opts: {
  userId: string;
  legalName: string;
}): Promise<{ phoneNumber: string; phoneSid: string; messagingServiceSid: string; subSid: string; subToken: string; assetId: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken, encryptToken } = await import("./tenant-crypto.server");

  // Load account-level credentials. Default to platform creds.
  const { data: acct } = await supabaseAdmin
    .from("accounts")
    .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
    .eq("id", opts.userId)
    .maybeSingle();

  let subSid = acct?.twilio_subaccount_sid ?? null;
  let subToken: string | null = null;
  if (subSid && acct?.twilio_subaccount_auth_token_enc) {
    try {
      subToken = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);
    } catch {
      subToken = null;
    }
  }
  if (!subSid || !subToken) {
    const m = masterAuth();
    subSid = m.sid;
    subToken = m.token;
    await supabaseAdmin
      .from("accounts")
      .update({
        twilio_subaccount_sid: subSid,
        twilio_subaccount_auth_token_enc: encryptToken(subToken) as any,
        onboarding_status: "sender_pending",
      })
      .eq("id", opts.userId);
  }

  // 1) Reuse an existing US toll-free asset if present.
  const { data: existing } = await supabaseAdmin
    .from("sender_assets")
    .select("id,phone_number,phone_sid,messaging_service_sid")
    .eq("account_id", opts.userId)
    .eq("country_code", "US")
    .eq("sender_kind", "toll_free")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.phone_sid && existing.phone_number && existing.messaging_service_sid) {
    return {
      phoneNumber: existing.phone_number,
      phoneSid: existing.phone_sid,
      messagingServiceSid: existing.messaging_service_sid,
      subSid,
      subToken,
      assetId: existing.id,
    };
  }

  // 2) Buy the first available US toll-free number that supports SMS.
  const avail = await twilio<{ available_phone_numbers: Array<{ phone_number: string }> }>(
    `${TWILIO_API}/Accounts/${subSid}/AvailablePhoneNumbers/US/TollFree.json?SmsEnabled=true&PageSize=1`,
    { sid: subSid, token: subToken },
  );
  const num = avail.available_phone_numbers?.[0]?.phone_number;
  if (!num) {
    throw new Error("No US toll-free numbers are available from the carrier right now. Try again in a few minutes.");
  }

  const base = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";
  const bought = await twilio<{ sid: string; phone_number: string }>(
    `${TWILIO_API}/Accounts/${subSid}/IncomingPhoneNumbers.json`,
    {
      method: "POST",
      sid: subSid,
      token: subToken,
      body: {
        PhoneNumber: num,
        SmsUrl: `${base}/api/public/twilio-inbound`,
        StatusCallback: `${base}/api/public/twilio-status`,
      },
    },
  );

  // 3) Wrap it in a Messaging Service so we can route through it.
  const ms = await twilio<{ sid: string }>(`${MESSAGING_API}/Services`, {
    method: "POST",
    sid: subSid,
    token: subToken,
    body: {
      FriendlyName: `${opts.legalName.slice(0, 40)} US`,
      InboundRequestUrl: `${base}/api/public/twilio-inbound`,
      StatusCallback: `${base}/api/public/twilio-status`,
    },
  });
  await twilio(`${MESSAGING_API}/Services/${ms.sid}/PhoneNumbers`, {
    method: "POST",
    sid: subSid,
    token: subToken,
    body: { PhoneNumberSid: bought.sid },
  });

  // 4) Save the asset (no verification yet) and return.
  let assetId: string | null = existing?.id ?? null;
  if (assetId) {
    await supabaseAdmin
      .from("sender_assets")
      .update({
        phone_number: bought.phone_number,
        phone_sid: bought.sid,
        messaging_service_sid: ms.sid,
        sender_kind: "toll_free",
        verification_status: "submitted",
      })
      .eq("id", assetId);
  } else {
    const ins = await supabaseAdmin
      .from("sender_assets")
      .insert({
        account_id: opts.userId,
        country_code: "US",
        sender_kind: "toll_free",
        phone_number: bought.phone_number,
        phone_sid: bought.sid,
        messaging_service_sid: ms.sid,
        verification_status: "submitted",
      })
      .select("id")
      .single();
    assetId = ins.data?.id ?? null;
  }

  return {
    phoneNumber: bought.phone_number,
    phoneSid: bought.sid,
    messagingServiceSid: ms.sid,
    subSid,
    subToken,
    assetId,
  };
}

export const submitTollfreeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TollfreeVerificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Persist the questionnaire snapshot onto the account too, so it round-trips on load.
    await supabaseAdmin
      .from("accounts")
      .update({
        legal_business_name: data.legalEntityName,
        website_url: data.websiteUrl,
        business_address: [
          data.addressLine1,
          data.addressLine2,
          `${data.city}, ${data.state} ${data.zip}`,
          data.businessCountry,
        ]
          .filter(Boolean)
          .join(", "),
        contact_email: data.contactEmail,
        full_name: `${data.contactFirstName} ${data.contactLastName}`.trim(),
        phone: `${data.contactPhoneCountry}${data.contactPhone}`,
        sample_message: data.sampleMessage,
        use_case_description: data.useCaseDescription,
        opt_in_description: data.proofOfOptInUrl || data.optInConfirmationMessage || "",
        privacy_policy_url: data.privacyPolicyUrl || null,
      })
      .eq("id", userId);

    const { phoneNumber, phoneSid, messagingServiceSid, subSid, subToken, assetId } =
      await getOrBuyUsTollfree({ userId, legalName: data.legalEntityName });

    // Build the Twilio Tollfree Verifications payload.
    const body: Record<string, string | string[]> = {
      TollfreePhoneNumberSid: phoneSid,
      BusinessName: data.legalEntityName,
      BusinessWebsite: data.websiteUrl,
      NotificationEmail: data.notificationEmail,
      UseCaseCategories: data.useCaseCategories,
      UseCaseSummary: data.useCaseDescription,
      ProductionMessageSample: data.sampleMessage,
      OptInType: data.optInType,
      MessageVolume: data.monthlyVolume,
      BusinessStreetAddress: data.addressLine1,
      BusinessCity: data.city,
      BusinessStateProvinceRegion: data.state,
      BusinessPostalCode: data.zip,
      BusinessCountry: data.businessCountry || "US",
      BusinessContactFirstName: data.contactFirstName,
      BusinessContactLastName: data.contactLastName,
      BusinessContactEmail: data.contactEmail,
      BusinessContactPhone: `${data.contactPhoneCountry}${data.contactPhone}`,
    };
    if (data.addressLine2) body.BusinessStreetAddress2 = data.addressLine2;
    if (data.proofOfOptInUrl) body.OptInImageUrls = [data.proofOfOptInUrl];
    const callbackBase = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";
    body.StatusCallback = `${callbackBase}/api/public/twilio-tollfree-status`;
    body.StatusCallbackMethod = "POST";
    const extra: string[] = [];
    if (data.businessDba) extra.push(`DBA: ${data.businessDba}`);
    if (data.businessType) extra.push(`Business type: ${data.businessType}`);
    if (data.privacyPolicyUrl) extra.push(`Privacy: ${data.privacyPolicyUrl}`);
    if (data.termsUrl) extra.push(`Terms: ${data.termsUrl}`);
    if (data.optInKeywords) extra.push(`Opt-in keywords: ${data.optInKeywords}`);
    if (data.optInConfirmationMessage)
      extra.push(`Opt-in confirmation: ${data.optInConfirmationMessage}`);
    if (data.helpMessageSample) extra.push(`HELP reply: ${data.helpMessageSample}`);
    if (data.containsAgeGatedContent) extra.push("Contains age-gated content");
    if (data.additionalInformation) extra.push(data.additionalInformation);
    if (extra.length) body.AdditionalInformation = extra.join("\n");

    let verificationSid: string | null = null;
    let status: "submitted" | "in_review" | "verified" | "rejected" = "submitted";
    let rejectionReason: string | null = null;
    try {
      const ver = await twilio<{ sid: string; status?: string }>(
        `${MESSAGING_API}/Tollfree/Verifications`,
        { method: "POST", sid: subSid, token: subToken, body },
      );
      verificationSid = ver.sid;
      status = mapStatus(ver.status);
    } catch (e: any) {
      status = "rejected";
      rejectionReason = e?.message ?? "Submission failed";
      // Surface the raw Twilio failure server-side so we can debug repeat rejections.
      console.error("[tollfree-verification] Twilio submission failed", {
        userId,
        phoneSid,
        message: rejectionReason,
      });
    }

    const patch: any = {
      verification_payload: data,
      verification_sid: verificationSid,
      verification_status: status,
      rejection_reason: rejectionReason,
      friendly_rejection_reason: rejectionReason ? friendlyReason(rejectionReason) : null,
      last_synced_at: new Date().toISOString(),
    };
    if (assetId) {
      await supabaseAdmin.from("sender_assets").update(patch).eq("id", assetId);
    } else {
      // Persist even without a pre-existing asset row so the rejection
      // reason shows up on reload instead of silently disappearing.
      await supabaseAdmin.from("sender_assets").upsert(
        {
          account_id: userId,
          country_code: "US",
          sender_kind: "toll_free",
          phone_number: phoneNumber,
          phone_sid: phoneSid,
          messaging_service_sid: messagingServiceSid,
          ...patch,
        },
        { onConflict: "account_id,country_code,phone_number" },
      );
    }

    return {
      phoneNumber,
      messagingServiceSid,
      verificationSid,
      status,
      rejectionReason,
      friendlyRejectionReason: rejectionReason ? friendlyReason(rejectionReason) : null,
    };
  });

export const getMyTollfreeVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: asset } = await supabase
      .from("sender_assets")
      .select(
        "id,phone_number,phone_sid,messaging_service_sid,verification_sid,verification_status,rejection_reason,friendly_rejection_reason,last_synced_at,verification_payload,created_at",
      )
      .eq("account_id", userId)
      .eq("country_code", "US")
      .eq("sender_kind", "toll_free")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { asset };
  });

export const refreshTollfreeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("./tenant-crypto.server");

    const { data: asset } = await supabaseAdmin
      .from("sender_assets")
      .select("id,verification_sid,account_id")
      .eq("account_id", userId)
      .eq("country_code", "US")
      .eq("sender_kind", "toll_free")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!asset?.verification_sid) {
      return { refreshed: false as const, reason: "No verification has been submitted yet." };
    }

    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
      .eq("id", userId)
      .maybeSingle();
    let subSid = acct?.twilio_subaccount_sid ?? null;
    let subToken: string | null = null;
    if (subSid && acct?.twilio_subaccount_auth_token_enc) {
      try {
        subToken = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);
      } catch {
        subToken = null;
      }
    }
    if (!subSid || !subToken) {
      const m = masterAuth();
      subSid = m.sid;
      subToken = m.token;
    }

    const ver = await twilio<any>(
      `${MESSAGING_API}/Tollfree/Verifications/${asset.verification_sid}`,
      { sid: subSid, token: subToken },
    );
    const status = mapStatus(ver.status);
    const reason =
      status === "rejected"
        ? Array.isArray(ver.rejection_reason)
          ? ver.rejection_reason.join("; ")
          : (ver.rejection_reason ?? ver.errors?.[0]?.description ?? "rejected")
        : null;
    await supabaseAdmin
      .from("sender_assets")
      .update({
        verification_status: status,
        rejection_reason: reason,
        friendly_rejection_reason: reason ? friendlyReason(reason) : null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", asset.id);
    if (status === "verified") {
      await supabaseAdmin
        .from("accounts")
        .update({ onboarding_status: "active" })
        .eq("id", userId);
    }
    return {
      refreshed: true as const,
      status,
      rejectionReason: reason,
      friendlyRejectionReason: reason ? friendlyReason(reason) : null,
    };
  });
