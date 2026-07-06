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
  if (t === "verified" || t === "approved" || t === "approved_verified") return "verified";
  if (t === "rejected" || t === "denied") return "rejected";
  if (t === "in_review" || t === "in-review" || t === "pending" || t === "in progress") return "in_review";
  return "submitted";
}

function toEntityType(value: string | undefined): string {
  switch ((value ?? "").toLowerCase()) {
    case "sole proprietor":
    case "sole proprietorship":
    case "sole_proprietor":
      return "SOLE_PROPRIETOR";
    case "public company":
    case "public_profit":
      return "PUBLIC_PROFIT";
    case "non-profit":
    case "non profit":
    case "non_profit":
      return "NON_PROFIT";
    case "government":
      return "GOVERNMENT";
    default:
      return "PRIVATE_PROFIT";
  }
}

function normalizeMessageVolume(value: string | undefined): string {
  return value === "5,000,000+" ? "5,000,000" : value || "10";
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== ""),
  ) as T;
}

function requireField(value: string | undefined, label: string, max = 500): string {
  const normalized = (value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return normalized;
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
  additionalInformation: string;
  optInConfirmationMessage?: string;
  helpMessageSample?: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  optInKeywords: string;
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
  phoneSid: string;             // Telnyx phone number ID (unused in body)
  phoneNumberE164?: string;     // Actual E.164 number — required by verification API
  accountSid: string;           // unused for Telnyx (kept for signature compat)
  authToken: string;            // unused for Telnyx
  existingVerificationSid?: string | null;
  payload: TollfreeSubmitPayload;
  statusCallbackUrl?: string;
}): Promise<TollfreeSubmitResult> {
  const p = opts.payload;
  const { normalizeUseCase } = await import("./tollfree-use-cases");
  const primaryUseCase = normalizeUseCase(p.useCaseCategories?.[0] ?? "") ?? "General Marketing";

  if (!opts.phoneNumberE164) throw new Error("Missing toll-free phone number for verification submission.");

  if (!p.proofOfOptInUrl) {
    throw new Error(
      "Proof of opt-in is required. Please upload a screenshot of your sign-up form/checkbox (or paste a public URL to it) in the Opt-in step before submitting.",
    );
  }
  const optInImages = [{ url: p.proofOfOptInUrl }];
  const useCaseDescription = requireField(p.useCaseDescription, "Use-case summary", 500);
  const additionalInformation = requireField(p.additionalInformation, "Additional use-case details", 500);
  const sampleMessage = requireField(p.sampleMessage, "Sample message", 1000);
  const privacyPolicyUrl = requireField(p.privacyPolicyUrl, "Privacy Policy URL", 500);
  const termsUrl = requireField(p.termsUrl, "Terms and Conditions URL", 500);
  const optInKeywords = requireField(p.optInKeywords, "Opt-in keywords", 500);
  const businessRegistrationNumber = requireField(p.businessRegistrationNumber, "Business registration number", 500);
  const businessRegistrationType = requireField(p.businessRegistrationIdentifier, "Business registration authority", 500);
  const businessRegistrationCountry = requireField(
    (p.businessRegistrationCountry || p.businessCountry || "").toUpperCase(),
    "Business registration country",
    2,
  );

  const body: Record<string, unknown> = compact({
    additionalInformation,
    businessAddr1: p.addressLine1,
    businessAddr2: p.addressLine2 || undefined,
    businessCity: p.city,
    businessContactEmail: p.contactEmail,
    businessContactFirstName: p.contactFirstName,
    businessContactLastName: p.contactLastName,
    businessContactPhone: `${p.contactPhoneCountry}${p.contactPhone}`.replace(/[^\d+]/g, ""),
    businessCountry: (p.businessCountry || "US").toUpperCase(),
    businessName: p.legalEntityName,
    businessState: p.state,
    businessZip: p.zip,
    corporateWebsite: p.websiteUrl,
    doingBusinessAs: p.businessDba || undefined,
    isvReseller: "Xellvio",
    messageVolume: normalizeMessageVolume(p.monthlyVolume),
    optInWorkflow: useCaseDescription,
    optInWorkflowImageURLs: optInImages,
    phoneNumbers: [{ phoneNumber: opts.phoneNumberE164 }],
    productionMessageContent: sampleMessage,
    useCase: primaryUseCase,
    useCaseSummary: useCaseDescription,
    webhookUrl: opts.statusCallbackUrl || undefined,
    businessRegistrationNumber,
    businessRegistrationType,
    businessRegistrationCountry,
    entityType: toEntityType(p.businessType),
    optInConfirmationResponse: p.optInConfirmationMessage || undefined,
    helpMessageResponse: p.helpMessageSample || undefined,
    privacyPolicyURL: privacyPolicyUrl,
    termsAndConditionURL: termsUrl,
    optInKeywords,
    ageGatedContent: !!p.containsAgeGatedContent,
  });

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
