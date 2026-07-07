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
  const t = (raw ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (t.includes("verified") || t.includes("approved")) return "verified";
  if (t.includes("rejected") || t.includes("denied") || t.includes("cancelled") || t.includes("canceled")) return "rejected";
  if (
    t.includes("review") ||
    t.includes("progress") ||
    t.includes("pending") ||
    t.includes("waiting for customer") ||
    t.includes("waiting for telnyx") ||
    t.includes("customer action")
  ) return "in_review";
  return "submitted";
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

function extractStatus(data: any): string | undefined {
  return pickString(
    data?.verificationStatus,
    data?.verification_status,
    data?.status,
    data?.requestStatus,
    data?.request_status,
  ) ?? undefined;
}

function extractReason(data: any, history?: any): string | null {
  const records = history?.records ?? history?.data?.records ?? history?.data ?? [];
  const historyReason = Array.isArray(records)
    ? records
        .map((record: any) => pickString(
          record?.reason,
          record?.statusReason,
          record?.status_reason,
          record?.message,
          record?.description,
          record?.comment,
        ))
        .find(Boolean)
    : null;
  return pickString(
    data?.reason,
    data?.rejectionReason,
    data?.rejection_reason,
    data?.friendlyRejectionReason,
    data?.friendly_rejection_reason,
    data?.statusReason,
    data?.status_reason,
    data?.customerMessage,
    data?.customer_message,
    data?.latestStatusChange?.reason,
    historyReason,
  );
}

async function fetchVerificationStatusHistory(id: string): Promise<any | null> {
  const query = "page[number]=1&page[size]=10";
  try {
    return await telnyx<any>(`/messaging/tollfree/verification/requests/${id}/status/history?${query}`);
  } catch (firstError: any) {
    if (firstError?.telnyxStatus !== 404) return null;
    try {
      return await telnyx<any>(`/messaging_tollfree/verification/requests/${id}/status/history?${query}`);
    } catch {
      return null;
    }
  }
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

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const CA_PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island",
  QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};

function businessStateName(country: string, state: string): string {
  const trimmed = state.trim();
  const code = trimmed.toUpperCase();
  if (country === "US") return US_STATE_NAMES[code] ?? trimmed;
  if (country === "CA") return CA_PROVINCE_NAMES[code] ?? trimmed;
  return trimmed;
}

function contactPhoneE164(countryCode: string, phone: string): string {
  const rawPhone = phone.trim();
  if (rawPhone.startsWith("+")) return `+${rawPhone.replace(/\D/g, "")}`;
  return `${countryCode}${rawPhone}`.replace(/(?!^)\+/g, "").replace(/[^\d+]/g, "");
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

function requireHttpsUrl(value: string | undefined, label: string): string {
  const normalized = requireField(value, label, 500);
  if (!normalized.startsWith("https://")) throw new Error(`${label} must start with https://`);
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
  const privacyPolicyUrl = requireHttpsUrl(p.privacyPolicyUrl, "Privacy Policy URL");
  const termsUrl = requireHttpsUrl(p.termsUrl, "Terms and Conditions URL");
  const optInKeywords = requireField(p.optInKeywords, "Opt-in keywords", 500);
  const businessRegistrationNumber = (p.businessRegistrationNumber ?? "").trim() || undefined;
  const businessRegistrationType = (p.businessRegistrationIdentifier ?? "").trim() || undefined;
  const rawRegCountry = (p.businessRegistrationCountry || "").toUpperCase().trim();
  const businessRegistrationCountry = /^[A-Z]{2}$/.test(rawRegCountry) ? rawRegCountry : undefined;
  const businessCountry = (p.businessCountry || "US").toUpperCase();

  const body: Record<string, unknown> = compact({
    additionalInformation,
    businessAddr1: p.addressLine1,
    businessAddr2: p.addressLine2 || undefined,
    businessCity: p.city,
    businessContactEmail: p.contactEmail,
    businessContactFirstName: p.contactFirstName,
    businessContactLastName: p.contactLastName,
    businessContactPhone: contactPhoneE164(p.contactPhoneCountry, p.contactPhone),
    businessCountry,
    businessName: p.legalEntityName,
    businessState: businessStateName(businessCountry, p.state),
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
    status: mapStatus(extractStatus(data)),
    rejectionReason: extractReason(data),
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
  const history = await fetchVerificationStatusHistory(opts.verificationSid);
  return {
    verificationSid: data?.id ?? opts.verificationSid,
    status: mapStatus(extractStatus(data)),
    rejectionReason: extractReason(data, history),
    raw: { ...res, statusHistory: history },
  };
}
