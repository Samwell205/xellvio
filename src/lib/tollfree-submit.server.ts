// Telnyx-based toll-free verification submit + fetch helpers.
// Telnyx's TF verification API lives at /v2/verified_numbers and
// /v2/messaging_tollfree/verification/requests. Because verification differs
// significantly from Twilio's, this module submits a minimal request and
// tracks it against a phone number.

const TELNYX_API = "https://api.telnyx.com/v2";

async function telnyx<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error("TELNYX_API_KEY is not configured");
  const res = await fetch(`${TELNYX_API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail ?? json?.errors?.[0]?.title ?? text.slice(0, 300);
    const err = new Error(`Telnyx ${res.status}: ${detail}`);
    (err as any).telnyxResponse = json;
    (err as any).telnyxStatus = res.status;
    throw err;
  }
  return json as T;
}

function mapStatus(raw: string | undefined): "submitted" | "in_review" | "verified" | "rejected" {
  const t = (raw ?? "").toLowerCase();
  if (t === "verified" || t === "approved") return "verified";
  if (t === "rejected" || t === "denied") return "rejected";
  if (t === "in_review" || t === "in-review" || t === "pending") return "in_review";
  return "submitted";
}

export type TollfreeSubmitPayload = {
  legalEntityName: string;
  businessDba?: string;
  websiteUrl: string;
  businessType: string;
  businessRegistrationNumber?: string;
  businessRegistrationIdentifier?: string;
  businessRegistrationCountry?: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhoneCountry: string;
  contactPhone: string;
  businessCountry: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  monthlyVolume: string;
  optInType: string;
  useCaseCategories: string[];
  proofOfOptInUrl?: string;
  useCaseDescription: string;
  sampleMessage: string;
  notificationEmail: string;
  additionalInformation?: string;
  optInConfirmationMessage?: string;
  helpMessageSample?: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
  optInKeywords?: string;
  containsAgeGatedContent?: boolean;
};

export type TollfreeSubmitResult = {
  verificationSid: string | null;
  status: "submitted" | "in_review" | "verified" | "rejected";
  rejectionReason: string | null;
  raw: any;
};

/**
 * Submit a toll-free verification request to Telnyx.
 * Telnyx's payload shape is different from Twilio's; we map the wizard fields.
 * The Telnyx endpoint is POST /messaging_tollfree/verification/requests.
 */
export async function submitTwilioTollfreeVerification(opts: {
  phoneSid: string;             // Telnyx phone number ID
  accountSid: string;           // unused for Telnyx (kept for signature compat)
  authToken: string;            // unused for Telnyx
  existingVerificationSid?: string | null;
  payload: TollfreeSubmitPayload;
  statusCallbackUrl?: string;
}): Promise<TollfreeSubmitResult> {
  const p = opts.payload;
  const body = {
    additional_information: p.additionalInformation ?? undefined,
    business_addr1: p.addressLine1,
    business_addr2: p.addressLine2 ?? undefined,
    business_city: p.city,
    business_contact_email: p.contactEmail,
    business_contact_first_name: p.contactFirstName,
    business_contact_last_name: p.contactLastName,
    business_contact_phone: `${p.contactPhoneCountry}${p.contactPhone}`,
    business_country: (p.businessCountry || "US").toUpperCase(),
    business_dba: p.businessDba ?? undefined,
    business_name: p.legalEntityName,
    business_state: p.state,
    business_website: p.websiteUrl,
    business_zip: p.zip,
    corporate_website: p.websiteUrl,
    isv_reseller: null,
    message_volume: p.monthlyVolume || "10",
    opt_in_workflow: {
      description: p.useCaseDescription,
      image_urls: p.proofOfOptInUrl ? [p.proofOfOptInUrl] : [],
    },
    opt_in_workflow_image_urls: p.proofOfOptInUrl ? [{ url: p.proofOfOptInUrl }] : [],
    phone_numbers: [{ phone_number: null as any, phone_number_id: opts.phoneSid }],
    production_message_sample: p.sampleMessage,
    use_case: (p.useCaseCategories?.[0] || "MARKETING").toUpperCase(),
    use_case_categories: p.useCaseCategories?.length ? p.useCaseCategories : ["MARKETING"],
    webhook_url: opts.statusCallbackUrl ?? undefined,
  };
  const path = opts.existingVerificationSid
    ? `/messaging_tollfree/verification/requests/${opts.existingVerificationSid}`
    : `/messaging_tollfree/verification/requests`;
  const method = opts.existingVerificationSid ? "PATCH" : "POST";
  const res = await telnyx<any>(path, { method, body });
  const data = res?.data ?? res;
  return {
    verificationSid: data?.id ?? opts.existingVerificationSid ?? null,
    status: mapStatus(data?.status),
    rejectionReason: data?.reason ?? data?.rejection_reason ?? null,
    raw: res,
  };
}

export async function fetchTwilioTollfreeVerification(opts: {
  verificationSid: string;
  accountSid: string; // unused
  authToken: string;  // unused
}): Promise<TollfreeSubmitResult> {
  const res = await telnyx<any>(`/messaging_tollfree/verification/requests/${opts.verificationSid}`);
  const data = res?.data ?? res;
  return {
    verificationSid: data?.id ?? opts.verificationSid,
    status: mapStatus(data?.status),
    rejectionReason: data?.reason ?? data?.rejection_reason ?? null,
    raw: res,
  };
}
