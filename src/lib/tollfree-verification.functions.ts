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
    (err as any).twilioResponse = json;
    throw err;
  }
  return json as T;
}

function friendlyReason(raw: string | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (!t) return "The carrier hasn't returned a specific reason yet.";
  if (t.includes("invalid sole proprietorship classification"))
    return "This business was submitted as a sole proprietor, but carriers are treating it as a registered business. Choose Private company / LLC / Partnership, enter the business registration details, and resubmit; the reserved toll-free number will be reused.";
  if (t.includes("business type is required") || t.includes("business registration"))
    return "Registered businesses must include a valid business type, registration number, registration authority, and registration country. Add those details and resubmit; the reserved toll-free number will be reused.";
  if (t.includes("privacy")) return "Your website needs a visible Privacy Policy link.";
  if (t.includes("terms")) return "Your website needs a visible Terms of Service link.";
  if (t.includes("usecasecategories"))
    return "The selected use case category was not accepted by Twilio. Choose one of the allowed categories below and retry; the reserved toll-free number will be reused.";
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
  if (t.includes("verification id") || t.includes("verification sid"))
    return "Twilio did not accept the toll-free verification request. No new number was purchased; review the form and retry now.";
  return raw!;
}

function attemptTwilioFields(e: any, reason: string) {
  const safeReason = reason || "Submission failed";
  return {
    failure_reason: safeReason,
    friendly_failure_reason: friendlyReason(safeReason),
    twilio_status: typeof e?.twilioStatus === "number" ? e.twilioStatus : null,
    twilio_code: e?.twilioCode != null ? String(e.twilioCode) : null,
    twilio_more_info: e?.twilioMore ?? null,
    twilio_response: e?.twilioResponse ?? null,
  };
}

function requestSummary(data: TollfreeVerificationPayload) {
  return {
    legalEntityName: data.legalEntityName,
    businessDba: data.businessDba || null,
    websiteUrl: data.websiteUrl,
    businessType: data.businessType,
    businessCountry: data.businessCountry,
    notificationEmail: data.notificationEmail,
    optInType: data.optInType,
    useCaseCategories: data.useCaseCategories,
    monthlyVolume: data.monthlyVolume,
    hasProofOfOptInUrl: !!data.proofOfOptInUrl,
    hasPrivacyPolicyUrl: !!data.privacyPolicyUrl,
    hasTermsUrl: !!data.termsUrl,
  };
}

async function createAttemptLog(supabaseAdmin: any, values: Record<string, any>) {
  const { data, error } = await (supabaseAdmin as any)
    .from("tollfree_verification_attempts")
    .insert(values)
    .select("id")
    .single();
  if (error) {
    console.error("[tollfree-verification] attempt log insert failed", error.message);
    return null;
  }
  return data?.id as string | null;
}

async function updateAttemptLog(supabaseAdmin: any, id: string | null, patch: Record<string, any>) {
  if (!id) return;
  const { error } = await (supabaseAdmin as any)
    .from("tollfree_verification_attempts")
    .update(patch)
    .eq("id", id);
  if (error) console.error("[tollfree-verification] attempt log update failed", error.message);
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
  "TWO_FACTOR_AUTHENTICATION",
  "ACCOUNT_NOTIFICATIONS",
  "CUSTOMER_CARE",
  "CHARITY_NONPROFIT",
  "DELIVERY_NOTIFICATIONS",
  "FRAUD_ALERT_MESSAGING",
  "EVENTS",
  "HIGHER_EDUCATION",
  "K12",
  "MARKETING",
  "POLLING_AND_VOTING_NON_POLITICAL",
  "POLITICAL_ELECTION_CAMPAIGNS",
  "PUBLIC_SERVICE_ANNOUNCEMENT",
  "SECURITY_ALERT",
] as const;

const TWILIO_BUSINESS_TYPES = [
  "PRIVATE_PROFIT",
  "PUBLIC_PROFIT",
  "SOLE_PROPRIETOR",
  "NON_PROFIT",
  "GOVERNMENT",
] as const;

const REGISTRATION_AUTHORITIES = [
  "EIN",
  "CBN",
  "CRN",
  "PROVINCIAL_NUMBER",
  "VAT",
  "ACN",
  "ABN",
  "BRN",
  "SIREN",
  "SIRET",
  "NZBN",
  "USt-IdNr",
  "CIF",
  "NIF",
  "CNPJ",
  "UID",
  "NEQ",
  "OTHER",
] as const;

const BUSINESS_TYPE_MAP: Record<string, (typeof TWILIO_BUSINESS_TYPES)[number]> = {
  "SOLE PROPRIETORSHIP": "SOLE_PROPRIETOR",
  "SOLE PROPRIETOR": "SOLE_PROPRIETOR",
  "PRIVATE COMPANY": "PRIVATE_PROFIT",
  "PRIVATE COMPANY / LLC / PARTNERSHIP": "PRIVATE_PROFIT",
  PARTNERSHIP: "PRIVATE_PROFIT",
  "LIMITED LIABILITY CORPORATION": "PRIVATE_PROFIT",
  LLC: "PRIVATE_PROFIT",
  "L.L.C.": "PRIVATE_PROFIT",
  "CO-OPERATIVE": "PRIVATE_PROFIT",
  COOPERATIVE: "PRIVATE_PROFIT",
  CORPORATION: "PRIVATE_PROFIT",
  "PUBLIC COMPANY": "PUBLIC_PROFIT",
  "PUBLIC CORPORATION": "PUBLIC_PROFIT",
  "NON-PROFIT CORPORATION": "NON_PROFIT",
  NONPROFIT: "NON_PROFIT",
  "NON-PROFIT": "NON_PROFIT",
  GOVERNMENT: "GOVERNMENT",
};

function normalizeBusinessType(value: string) {
  const raw = value.trim();
  const upper = raw.toUpperCase().replace(/\s+/g, " ");
  if ((TWILIO_BUSINESS_TYPES as readonly string[]).includes(upper)) {
    return upper as (typeof TWILIO_BUSINESS_TYPES)[number];
  }
  return BUSINESS_TYPE_MAP[upper] ?? "PRIVATE_PROFIT";
}

function normalizeRegistrationAuthority(value: string) {
  const raw = value.trim();
  const found = REGISTRATION_AUTHORITIES.find((authority) => authority.toUpperCase() === raw.toUpperCase());
  return found ?? null;
}

function looksLikeRegisteredEntity(name: string) {
  return /\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORPORATION|LTD|LIMITED|LP|LLP|CO\.|COMPANY|NONPROFIT|NON-PROFIT)\b/i.test(
    name,
  );
}

const LEGACY_USE_CASE_CATEGORY_MAP: Record<string, (typeof USE_CASE_CATEGORIES)[number]> = {
  "2FA": "TWO_FACTOR_AUTHENTICATION",
  FRAUD_ALERTS: "FRAUD_ALERT_MESSAGING",
  GENERAL_MARKETING: "MARKETING",
  POLLING_AND_VOTING: "POLLING_AND_VOTING_NON_POLITICAL",
  POLITICAL: "POLITICAL_ELECTION_CAMPAIGNS",
  SECURITY_ALERTS: "SECURITY_ALERT",
  GENERAL_SCHOOL_UPDATES: "K12",
  HEALTHCARE_ALERTS: "ACCOUNT_NOTIFICATIONS",
  APPOINTMENTS: "ACCOUNT_NOTIFICATIONS",
  BOOKING_CONFIRMATIONS: "ACCOUNT_NOTIFICATIONS",
  BUSINESS_UPDATES: "ACCOUNT_NOTIFICATIONS",
  ORDER_NOTIFICATIONS: "ACCOUNT_NOTIFICATIONS",
  DELIVERY_NOTIFICATIONS: "DELIVERY_NOTIFICATIONS",
  EVENTS: "EVENTS",
  CHARITY_NONPROFIT: "CHARITY_NONPROFIT",
  PUBLIC_SERVICE_ANNOUNCEMENT: "PUBLIC_SERVICE_ANNOUNCEMENT",
};

function normalizeUseCaseCategories(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const normalized = raw
    .map((v) => String(v).trim().toUpperCase())
    .map((v) => LEGACY_USE_CASE_CATEGORY_MAP[v] ?? v)
    .filter((v): v is (typeof USE_CASE_CATEGORIES)[number] =>
      (USE_CASE_CATEGORIES as readonly string[]).includes(v),
    );
  const deduped = Array.from(new Set(normalized)).slice(0, 5);
  // Always guarantee at least one valid category so the carrier submission
  // never fails purely because saved/legacy values normalized to empty.
  return deduped.length > 0 ? deduped : ["MARKETING"];
}

export const TollfreeVerificationInput = z.object({
  legalEntityName: z.string().trim().min(2).max(255),
  businessDba: z.string().trim().max(255).optional(),
  websiteUrl: z.string().trim().url(),
  businessType: z.string().trim().min(2).max(64),
  businessRegistrationNumber: z.string().trim().max(64).optional().or(z.literal("")),
  businessRegistrationIdentifier: z.string().trim().max(64).optional().or(z.literal("")),
  businessRegistrationCountry: z.string().trim().length(2).optional().or(z.literal("")),
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
  useCaseCategories: z.preprocess(
    normalizeUseCaseCategories,
    z.array(z.enum(USE_CASE_CATEGORIES)).min(1).max(5),
  ),
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

type StoredVerificationStatus = "pending" | "submitted" | "in_review" | "verified" | "rejected";

function storedStatus(raw: string | null | undefined): StoredVerificationStatus {
  if (raw === "submitted" || raw === "in_review" || raw === "verified" || raw === "rejected") {
    return raw;
  }
  return "pending";
}

async function findExistingTollfreeVerification(opts: { phoneSid: string; sid: string; token: string }) {
  const query = new URLSearchParams({ TollfreePhoneNumberSid: opts.phoneSid, PageSize: "1" }).toString();
  const page = await twilio<{
    tollfree_verifications?: Array<{ sid?: string; status?: string; rejection_reason?: unknown; errors?: Array<{ description?: string }> }>;
  }>(`${MESSAGING_API}/Tollfree/Verifications?${query}`, {
    sid: opts.sid,
    token: opts.token,
  });
  return page.tollfree_verifications?.[0] ?? null;
}

async function getOrBuyUsTollfree(opts: {
  userId: string;
  legalName: string;
}): Promise<{
  phoneNumber: string;
  phoneSid: string;
  messagingServiceSid: string;
  subSid: string;
  subToken: string;
  assetId: string | null;
  verificationSid: string | null;
  verificationStatus: StoredVerificationStatus;
  alreadySubmitted: boolean;
}> {
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

  type AssetRow = {
    id: string;
    phone_number: string | null;
    phone_sid: string | null;
    messaging_service_sid: string | null;
    verification_sid: string | null;
    verification_status: string | null;
    created_at: string | null;
  };
  const selectAsset =
    "id,phone_number,phone_sid,messaging_service_sid,verification_sid,verification_status,created_at";
  const loadAsset = async () => {
    const { data: row, error } = await supabaseAdmin
      .from("sender_assets")
      .select(selectAsset)
      .eq("account_id", opts.userId)
      .eq("country_code", "US")
      .eq("sender_kind", "toll_free")
      .maybeSingle();
    if (error) throw error;
    return (row ?? null) as AssetRow | null;
  };

  // 1) Claim exactly one US toll-free asset row before any carrier purchase.
  // This idempotency guard prevents rapid repeat clicks from buying numbers.
  let existing = await loadAsset();
  let createdPlaceholder = false;
  if (!existing) {
    const ins = await supabaseAdmin
      .from("sender_assets")
      .insert({
        account_id: opts.userId,
        country_code: "US",
        sender_kind: "toll_free",
        verification_status: "pending",
      })
      .select(selectAsset)
      .single();
    if (ins.error) {
      if ((ins.error as any).code !== "23505") throw ins.error;
      existing = await loadAsset();
    } else {
      existing = ins.data as AssetRow;
      createdPlaceholder = true;
    }
  }
  if (!existing) throw new Error("Could not reserve a toll-free sender record. Please try again.");

  const currentStatus = storedStatus(existing.verification_status);
  const alreadySubmitted =
    !!existing.verification_sid &&
    (currentStatus === "submitted" || currentStatus === "in_review" || currentStatus === "verified");
  if (alreadySubmitted) {
    return {
      phoneNumber: existing.phone_number ?? "",
      phoneSid: existing.phone_sid ?? "",
      messagingServiceSid: existing.messaging_service_sid ?? "",
      subSid,
      subToken,
      assetId: existing.id,
      verificationSid: existing.verification_sid,
      verificationStatus: currentStatus,
      alreadySubmitted: true,
    };
  }

  const base = process.env.PUBLIC_BASE_URL ?? "https://samwell-reach-global.lovable.app";

  const findMessagingServiceForPhone = async (phoneSid: string): Promise<string | null> => {
    // Walk all Messaging Services for this (sub)account and return the SID
    // of the one that already contains this phone number, if any.
    let next: string | null = `${MESSAGING_API}/Services?PageSize=50`;
    while (next) {
      const page: { services?: Array<{ sid: string }>; meta?: { next_page_url?: string | null } } = await twilio(
        next,
        { sid: subSid, token: subToken },
      );
      for (const svc of page.services ?? []) {
        try {
          await twilio(`${MESSAGING_API}/Services/${svc.sid}/PhoneNumbers/${phoneSid}`, {
            sid: subSid,
            token: subToken,
          });
          return svc.sid;
        } catch {
          // not in this service, keep looking
        }
      }
      next = page.meta?.next_page_url ?? null;
    }
    return null;
  };

  const createMessagingService = async (phoneSid: string) => {
    const ms = await twilio<{ sid: string }>(`${MESSAGING_API}/Services`, {
      method: "POST",
      sid: subSid,
      token: subToken,
      body: {
        FriendlyName: `${opts.legalName.slice(0, 40)} US ${Date.now().toString(36)}`,
        InboundRequestUrl: `${base}/api/public/twilio-inbound`,
        StatusCallback: `${base}/api/public/twilio-status`,
      },
    });
    try {
      await twilio(`${MESSAGING_API}/Services/${ms.sid}/PhoneNumbers`, {
        method: "POST",
        sid: subSid,
        token: subToken,
        body: { PhoneNumberSid: phoneSid },
      });
      return ms.sid;
    } catch (e: any) {
      const code = e?.twilioCode;
      const msg = String(e?.message ?? "").toLowerCase();
      const alreadyAttached =
        code === 21712 ||
        code === "21712" ||
        msg.includes("associated with another messaging service") ||
        msg.includes("already") && msg.includes("messaging service");
      if (!alreadyAttached) {
        // Clean up empty service we just created so we don't leak it.
        try {
          await twilio(`${MESSAGING_API}/Services/${ms.sid}`, {
            method: "DELETE",
            sid: subSid,
            token: subToken,
          });
        } catch {}
        throw e;
      }
      // Find the existing messaging service that owns this phone number and reuse it.
      const existingMs = await findMessagingServiceForPhone(phoneSid);
      try {
        await twilio(`${MESSAGING_API}/Services/${ms.sid}`, {
          method: "DELETE",
          sid: subSid,
          token: subToken,
        });
      } catch {}
      if (!existingMs) {
        throw new Error(
          "This toll-free number is already attached to another Messaging Service on the carrier, but we couldn't locate it to reuse. Please contact support.",
        );
      }
      return existingMs;
    }
  };

  // 2) Reuse/recover an existing reserved number. Never buy another number
  // for an account that already has a toll-free sender row.
  if (existing.phone_number || existing.phone_sid) {
    if (!createdPlaceholder && currentStatus !== "rejected") {
      const lockCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const claimed = await supabaseAdmin
        .from("sender_assets")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", existing.id)
        .or(`last_synced_at.is.null,last_synced_at.lt.${lockCutoff}`)
        .select(selectAsset)
        .maybeSingle();
      if (claimed.error) throw claimed.error;
      if (!claimed.data) {
        throw new Error("This toll-free request is already being processed. Please wait a moment before trying again.");
      }
      existing = claimed.data as AssetRow;
    }
    let phoneSid = existing.phone_sid;
    let phoneNumber = existing.phone_number;
    if (!phoneSid && phoneNumber) {
      const qs = new URLSearchParams({ PhoneNumber: phoneNumber, PageSize: "1" }).toString();
      const found = await twilio<{ incoming_phone_numbers: Array<{ sid: string; phone_number: string }> }>(
        `${TWILIO_API}/Accounts/${subSid}/IncomingPhoneNumbers.json?${qs}`,
        { sid: subSid, token: subToken },
      );
      const match = found.incoming_phone_numbers?.[0];
      if (!match) {
        throw new Error(
          `A toll-free number (${phoneNumber}) is already reserved for this account, so another number will not be purchased. Please contact support to reconnect it before submitting again.`,
        );
      }
      phoneSid = match.sid;
      phoneNumber = match.phone_number;
    }
    if (!phoneSid) throw new Error("The reserved toll-free number is missing its carrier ID.");
    const messagingServiceSid = existing.messaging_service_sid ?? (await createMessagingService(phoneSid));
    await supabaseAdmin
      .from("sender_assets")
      .update({
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        messaging_service_sid: messagingServiceSid,
      })
      .eq("id", existing.id);
    return {
      phoneNumber: phoneNumber ?? "",
      phoneSid,
      messagingServiceSid,
      subSid,
      subToken,
      assetId: existing.id,
      verificationSid: existing.verification_sid,
      verificationStatus: currentStatus,
      alreadySubmitted: false,
    };
  }

  const stalePlaceholder = existing.created_at
    ? Date.now() - Date.parse(existing.created_at) > 10 * 60 * 1000
    : true;
  if (!createdPlaceholder && !stalePlaceholder) {
    throw new Error("A toll-free number reservation is already being prepared. Please wait a moment before trying again.");
  }
  if (!createdPlaceholder) {
    const lockCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const claimed = await supabaseAdmin
      .from("sender_assets")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", existing.id)
      .or(`last_synced_at.is.null,last_synced_at.lt.${lockCutoff}`)
      .select(selectAsset)
      .maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) {
      throw new Error("A toll-free number reservation is already being prepared. Please wait a moment before trying again.");
    }
    existing = claimed.data as AssetRow;
  }

  // 3) Buy once, only after this request owns the single placeholder row.
  const avail = await twilio<{ available_phone_numbers: Array<{ phone_number: string }> }>(
    `${TWILIO_API}/Accounts/${subSid}/AvailablePhoneNumbers/US/TollFree.json?SmsEnabled=true&PageSize=1`,
    { sid: subSid, token: subToken },
  );
  const num = avail.available_phone_numbers?.[0]?.phone_number;
  if (!num) {
    throw new Error("No US toll-free numbers are available from the carrier right now. Try again in a few minutes.");
  }

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
  const messagingServiceSid = await createMessagingService(bought.sid);

  await supabaseAdmin
    .from("sender_assets")
    .update({
      phone_number: bought.phone_number,
      phone_sid: bought.sid,
      messaging_service_sid: messagingServiceSid,
      verification_status: "pending",
    })
    .eq("id", existing.id);

  return {
    phoneNumber: bought.phone_number,
    phoneSid: bought.sid,
    messagingServiceSid,
    subSid,
    subToken,
    assetId: existing.id,
    verificationSid: existing.verification_sid,
    verificationStatus: currentStatus,
    alreadySubmitted: false,
  };
}

export const submitTollfreeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TollfreeVerificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const attemptId = await createAttemptLog(supabaseAdmin, {
      account_id: userId,
      actor_user_id: userId,
      attempt_status: "started",
      request_summary: requestSummary(data),
    });

    const initialTwilioBusinessType = normalizeBusinessType(data.businessType);
    const registrationNumber = (data.businessRegistrationNumber ?? "").trim();
    const registrationAuthority = (data.businessRegistrationIdentifier ?? "").trim();
    const registrationCountry = (data.businessRegistrationCountry || data.businessCountry || "").trim();
    const normalizedRegistrationAuthority = normalizeRegistrationAuthority(registrationAuthority);
    if (initialTwilioBusinessType === "SOLE_PROPRIETOR" && looksLikeRegisteredEntity(data.legalEntityName)) {
      const reason = "This legal entity name looks like a registered business, so it cannot be submitted as a sole proprietor. Choose Private company / LLC / Partnership and add the registration details.";
      await updateAttemptLog(supabaseAdmin, attemptId, {
        attempt_status: "failed",
        failure_reason: reason,
        friendly_failure_reason: reason,
      });
      throw new Error(reason);
    }
    if (initialTwilioBusinessType !== "SOLE_PROPRIETOR" && (!registrationNumber || !registrationAuthority || !registrationCountry)) {
      const reason = "Registered businesses must include a registration number, registration authority, and registration country before carrier submission.";
      await updateAttemptLog(supabaseAdmin, attemptId, {
        attempt_status: "failed",
        failure_reason: reason,
        friendly_failure_reason: reason,
      });
      throw new Error(reason);
    }
    if (initialTwilioBusinessType !== "SOLE_PROPRIETOR" && !normalizedRegistrationAuthority) {
      const reason = "Registration authority must be one of Twilio's accepted codes, such as EIN for US businesses.";
      await updateAttemptLog(supabaseAdmin, attemptId, {
        attempt_status: "failed",
        failure_reason: reason,
        friendly_failure_reason: reason,
      });
      throw new Error(reason);
    }

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

    let reserved;
    try {
      reserved = await getOrBuyUsTollfree({ userId, legalName: data.legalEntityName });
    } catch (e: any) {
      const reason = e?.message ?? "Could not reserve or reconnect the toll-free number.";
      await updateAttemptLog(supabaseAdmin, attemptId, {
        attempt_status: "failed",
        ...attemptTwilioFields(e, reason),
      });
      if (!reason.toLowerCase().includes("already being")) {
        await supabaseAdmin
          .from("sender_assets")
          .update({
            verification_status: "rejected",
            rejection_reason: reason,
            friendly_rejection_reason: friendlyReason(reason),
            last_synced_at: new Date().toISOString(),
          })
          .eq("account_id", userId)
          .eq("country_code", "US")
          .eq("sender_kind", "toll_free")
          .is("verification_sid", null);
      }
      throw new Error(friendlyReason(reason));
    }

    const {
      phoneNumber,
      phoneSid,
      messagingServiceSid,
      subSid,
      subToken,
      assetId,
      verificationSid: existingVerificationSid,
      verificationStatus: existingVerificationStatus,
      alreadySubmitted,
    } = reserved;

    if (alreadySubmitted) {
      await updateAttemptLog(supabaseAdmin, attemptId, {
        sender_asset_id: assetId,
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        messaging_service_sid: messagingServiceSid,
        verification_sid: existingVerificationSid,
        attempt_status: "already_submitted",
      });
      return {
        phoneNumber,
        messagingServiceSid,
        verificationSid: existingVerificationSid,
        status: existingVerificationStatus === "pending" ? "submitted" : existingVerificationStatus,
        rejectionReason: null,
        friendlyRejectionReason: null,
        alreadySubmitted: true,
      };
    }
    await updateAttemptLog(supabaseAdmin, attemptId, {
      sender_asset_id: assetId,
      phone_number: phoneNumber,
      phone_sid: phoneSid,
      messaging_service_sid: messagingServiceSid,
      attempt_status: "number_reserved",
    });

    // Map UI business type to Twilio's required enum.
    const twilioBusinessType = normalizeBusinessType(data.businessType);
    const businessCountry = (data.businessCountry || "US").toUpperCase();
    const twilioRegistrationCountry = (registrationCountry || businessCountry).toUpperCase();
    const twilioRegistrationAuthority = normalizedRegistrationAuthority;

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
      BusinessCountry: businessCountry,
      BusinessContactFirstName: data.contactFirstName,
      BusinessContactLastName: data.contactLastName,
      BusinessContactEmail: data.contactEmail,
      BusinessContactPhone: `${data.contactPhoneCountry}${data.contactPhone}`,
      BusinessType: twilioBusinessType,
    };
    if (data.businessDba) body.DoingBusinessAs = data.businessDba;
    // Carriers require registration details for every business type except SOLE_PROPRIETOR.
    if (twilioBusinessType !== "SOLE_PROPRIETOR") {
      if (!registrationNumber || !twilioRegistrationAuthority || !twilioRegistrationCountry) {
        throw new Error(
          "Registered businesses must include a registration number, registration authority, and registration country before carrier submission.",
        );
      }
      body.BusinessRegistrationNumber = registrationNumber;
      body.BusinessRegistrationAuthority = twilioRegistrationAuthority;
      body.BusinessRegistrationCountry = twilioRegistrationCountry;
    }
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
    let twilioResponse: any = null;
    try {
      const ver = await twilio<{ sid?: string; status?: string }>(
        `${MESSAGING_API}/Tollfree/Verifications`,
        { method: "POST", sid: subSid, token: subToken, body },
      );
      twilioResponse = ver;
      verificationSid = typeof ver.sid === "string" && ver.sid.trim() ? ver.sid : null;
      if (!verificationSid) {
        const err = new Error("Twilio did not return a toll-free verification ID, so the submission was not accepted.");
        (err as any).noVerificationSid = true;
        (err as any).twilioResponse = ver;
        throw err;
      }
      status = mapStatus(ver.status);
    } catch (e: any) {
      status = "rejected";
      rejectionReason = e?.message ?? "Submission failed";
      await updateAttemptLog(supabaseAdmin, attemptId, {
        attempt_status: e?.noVerificationSid ? "no_verification_sid" : "failed",
        verification_sid: verificationSid,
        ...attemptTwilioFields(e, rejectionReason ?? "Submission failed"),
      });
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
      const { error: insErr } = await supabaseAdmin.from("sender_assets").insert({
        account_id: userId,
        country_code: "US",
        sender_kind: "toll_free",
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        messaging_service_sid: messagingServiceSid,
        ...patch,
      });
      if (insErr) console.error("[tollfree-verification] persist insert failed", insErr.message);
    }
    if (verificationSid) {
      await updateAttemptLog(supabaseAdmin, attemptId, {
        attempt_status: "submitted",
        verification_sid: verificationSid,
        twilio_response: twilioResponse,
      });
    }

    return {
      phoneNumber,
      messagingServiceSid,
      verificationSid,
      status,
      rejectionReason,
      friendlyRejectionReason: rejectionReason ? friendlyReason(rejectionReason) : null,
      alreadySubmitted: false,
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
