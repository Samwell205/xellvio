// Server-only helper to submit a Twilio Toll-Free Verification given a
// wizard payload + a phone SID that was already purchased on Twilio.
// Shared by the tenant flow and the verifier flow.

const MESSAGING_API = "https://messaging.twilio.com/v1";

function basic(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

const BUSINESS_TYPE_MAP: Record<string, string> = {
  "SOLE PROPRIETOR": "SOLE_PROPRIETOR",
  "SOLE PROPRIETORSHIP": "SOLE_PROPRIETOR",
  "PRIVATE COMPANY": "PRIVATE_PROFIT",
  "PRIVATE COMPANY / LLC / PARTNERSHIP": "PRIVATE_PROFIT",
  PARTNERSHIP: "PRIVATE_PROFIT",
  LLC: "PRIVATE_PROFIT",
  CORPORATION: "PRIVATE_PROFIT",
  "PUBLIC COMPANY": "PUBLIC_PROFIT",
  "NON-PROFIT": "NON_PROFIT",
  NONPROFIT: "NON_PROFIT",
  GOVERNMENT: "GOVERNMENT",
};

function normalizeBusinessType(v: string) {
  const u = (v || "").trim().toUpperCase().replace(/\s+/g, " ");
  const known = ["PRIVATE_PROFIT", "PUBLIC_PROFIT", "SOLE_PROPRIETOR", "NON_PROFIT", "GOVERNMENT"];
  if (known.includes(u)) return u;
  return BUSINESS_TYPE_MAP[u] ?? "PRIVATE_PROFIT";
}

function mapStatus(raw: string | undefined): "submitted" | "in_review" | "verified" | "rejected" {
  const t = (raw ?? "").toUpperCase();
  if (t === "APPROVED" || t === "TWILIO_APPROVED") return "verified";
  if (t === "REJECTED" || t === "TWILIO_REJECTED") return "rejected";
  if (t === "IN_REVIEW") return "in_review";
  return "submitted";
}

function rejectionReason(ver: any): string | null {
  if (!ver) return null;
  if (Array.isArray(ver.rejection_reason)) return ver.rejection_reason.join("; ");
  if (typeof ver.rejection_reason === "string") return ver.rejection_reason;
  if (Array.isArray(ver.rejection_reasons)) {
    return ver.rejection_reasons.map((r: any) => r?.description ?? r?.message ?? String(r)).filter(Boolean).join("; ") || null;
  }
  if (Array.isArray(ver.errors) && ver.errors[0]?.description) return ver.errors[0].description;
  return null;
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

export async function submitTwilioTollfreeVerification(opts: {
  phoneSid: string;
  accountSid: string;
  authToken: string;
  existingVerificationSid?: string | null;
  payload: TollfreeSubmitPayload;
  statusCallbackUrl?: string;
}): Promise<TollfreeSubmitResult> {
  const p = opts.payload;
  const body: Record<string, string | string[]> = {
    TollfreePhoneNumberSid: opts.phoneSid,
    BusinessName: p.legalEntityName,
    BusinessWebsite: p.websiteUrl,
    NotificationEmail: p.notificationEmail || p.contactEmail,
    UseCaseCategories: (p.useCaseCategories?.length ? p.useCaseCategories : ["MARKETING"]),
    UseCaseSummary: p.useCaseDescription,
    ProductionMessageSample: p.sampleMessage,
    OptInType: p.optInType || "WEB_FORM",
    MessageVolume: p.monthlyVolume || "10",
    BusinessStreetAddress: p.addressLine1,
    BusinessCity: p.city,
    BusinessStateProvinceRegion: p.state,
    BusinessPostalCode: p.zip,
    BusinessCountry: (p.businessCountry || "US").toUpperCase(),
    BusinessContactFirstName: p.contactFirstName,
    BusinessContactLastName: p.contactLastName,
    BusinessContactEmail: p.contactEmail,
    BusinessContactPhone: `${p.contactPhoneCountry}${p.contactPhone}`,
    BusinessType: normalizeBusinessType(p.businessType),
  };
  if (p.businessDba) body.DoingBusinessAs = p.businessDba;
  if (p.addressLine2) body.BusinessStreetAddress2 = p.addressLine2;
  if (p.proofOfOptInUrl) body.OptInImageUrls = [p.proofOfOptInUrl];
  if (p.privacyPolicyUrl) body.PrivacyPolicyUrl = p.privacyPolicyUrl;
  if (p.termsUrl) body.TermsAndConditionsUrl = p.termsUrl;
  if (p.optInConfirmationMessage) body.OptInConfirmationMessage = p.optInConfirmationMessage;
  if (p.helpMessageSample) body.HelpMessageSample = p.helpMessageSample;
  if (p.optInKeywords) {
    const kws = Array.from(new Set(p.optInKeywords.split(/[\s,]+/).map((k) => k.trim().toUpperCase()).filter(Boolean))).slice(0, 20);
    if (kws.length) body.OptInKeywords = kws;
  }
  body.AgeGatedContent = p.containsAgeGatedContent ? "true" : "false";
  if (opts.statusCallbackUrl) {
    body.StatusCallback = opts.statusCallbackUrl;
    body.StatusCallbackMethod = "POST";
  }
  if (p.additionalInformation) body.AdditionalInformation = p.additionalInformation;

  // Registration details for non-sole-proprietor
  if (body.BusinessType !== "SOLE_PROPRIETOR") {
    if (p.businessRegistrationNumber) body.BusinessRegistrationNumber = p.businessRegistrationNumber;
    if (p.businessRegistrationIdentifier) body.BusinessRegistrationAuthority = p.businessRegistrationIdentifier;
    if (p.businessRegistrationCountry) body.BusinessRegistrationCountry = p.businessRegistrationCountry.toUpperCase();
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) for (const x of v) params.append(k, x);
    else params.append(k, v);
  }

  const url = opts.existingVerificationSid
    ? `${MESSAGING_API}/Tollfree/Verifications/${opts.existingVerificationSid}`
    : `${MESSAGING_API}/Tollfree/Verifications`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basic(opts.accountSid, opts.authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message ?? `Carrier API ${res.status}`);
    (err as any).twilioResponse = json;
    (err as any).twilioStatus = res.status;
    throw err;
  }
  const status = mapStatus(json?.status);
  return {
    verificationSid: json?.sid ?? opts.existingVerificationSid ?? null,
    status,
    rejectionReason: status === "rejected" ? rejectionReason(json) : null,
    raw: json,
  };
}

export async function fetchTwilioTollfreeVerification(opts: {
  verificationSid: string;
  accountSid: string;
  authToken: string;
}): Promise<TollfreeSubmitResult> {
  const res = await fetch(`${MESSAGING_API}/Tollfree/Verifications/${opts.verificationSid}`, {
    headers: { Authorization: basic(opts.accountSid, opts.authToken) },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message ?? `Carrier API ${res.status}`);
    (err as any).twilioResponse = json;
    throw err;
  }
  const status = mapStatus(json?.status);
  return {
    verificationSid: json?.sid ?? opts.verificationSid,
    status,
    rejectionReason: status === "rejected" ? rejectionReason(json) : null,
    raw: json,
  };
}
