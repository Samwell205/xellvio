// Verifier toll-free numbers on Twilio: every number lives alone in its own
// Twilio subaccount (never shared). The subaccount is recorded in
// twilio_verified_inventory (owner_account_sid) keyed by the phone SID that
// verifier_tfns.telnyx_number_id stores (legacy column name).
import type { TollfreeSubmitPayload, TollfreeSubmitResult } from "./tollfree-submit.server";

const API = "https://api.twilio.com/2010-04-01";
const TFV = "https://messaging.twilio.com/v1/Tollfree/Verifications";
const b64 = (s: string) => "Basic " + Buffer.from(s).toString("base64");

function parentAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error("Number provisioning is temporarily unavailable.");
  return { sid, auth: b64(`${sid}:${tok}`) };
}

async function tw(url: string, auth: string, body?: Array<[string, string]>): Promise<any> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? new URLSearchParams(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[verifier-twilio] ${res.status} ${url}: ${JSON.stringify(j).slice(0, 400)}`);
    throw new Error(String(j?.message ?? `Carrier request failed (${res.status})`).replace(/twilio/gi, "carrier"));
  }
  return j;
}

/** Subaccount auth: the parent can always read a child's token. */
async function subAuthFor(subSid: string) {
  const parent = parentAuth();
  const acct = await tw(`${API}/Accounts/${subSid}.json`, parent.auth);
  if (acct?.owner_account_sid !== parent.sid || !acct?.auth_token) throw new Error("Number account could not be authenticated.");
  return b64(`${subSid}:${acct.auth_token}`);
}

/** New subaccount → buy one toll-free inside it → record it. One number per subaccount. */
export async function provisionVerifierNumber(db: any, verifierId: string) {
  const parent = parentAuth();
  const acct = await tw(`${API}/Accounts.json`, parent.auth, [["FriendlyName", `xellvio-verifier-${verifierId.slice(0, 8)}-${Date.now()}`]]);
  const auth = b64(`${acct.sid}:${acct.auth_token}`);
  try {
    const avail = await tw(`${API}/Accounts/${acct.sid}/AvailablePhoneNumbers/US/TollFree.json?SmsEnabled=true&PageSize=5`, auth);
    const pick = avail?.available_phone_numbers?.[0]?.phone_number;
    if (!pick) throw new Error("No toll-free numbers are available right now. Please try again later.");
    const bought = await tw(`${API}/Accounts/${acct.sid}/IncomingPhoneNumbers.json`, auth, [
      ["PhoneNumber", pick], ["FriendlyName", `Verifier ${verifierId.slice(0, 8)}`],
      ["SmsUrl", "https://xellvio.com/api/public/twilio/inbound"], ["SmsMethod", "POST"],
    ]);
    // Not offered for direct sale: verifier numbers are sold through the verifier marketplace.
    const { error } = await db.from("twilio_verified_inventory").insert({
      phone_sid: bought.sid, phone_number: bought.phone_number, owner_account_sid: acct.sid,
      verification_status: "pending", assignment_state: "available", available: false,
    });
    if (error) throw new Error(error.message);
    return { phoneSid: bought.sid as string, phoneNumber: bought.phone_number as string, subaccountSid: acct.sid as string };
  } catch (e) {
    // Close the empty subaccount so it never lingers or gets reused.
    await tw(`${API}/Accounts/${acct.sid}.json`, parent.auth, [["Status", "closed"]]).catch(() => {});
    throw e;
  }
}

/** Subaccount that owns this phone SID, or null for legacy (non-Twilio) rows. */
export async function subaccountForPhone(db: any, phoneSid: string | null): Promise<string | null> {
  if (!phoneSid || !phoneSid.startsWith("PN")) return null;
  const parentSid = process.env.TWILIO_ACCOUNT_SID;
  const { data } = await db.from("twilio_verified_inventory").select("owner_account_sid").eq("phone_sid", phoneSid).maybeSingle();
  const sid = data?.owner_account_sid ?? null;
  return sid && sid !== parentSid ? sid : null;
}

export function mapTwilioStatus(raw: string | undefined): TollfreeSubmitResult["status"] {
  const s = String(raw ?? "").toUpperCase();
  if (s === "TWILIO_APPROVED") return "verified";
  if (s === "TWILIO_REJECTED") return "rejected";
  if (s === "IN_REVIEW") return "in_review";
  return "submitted";
}

function businessType(t: string): string {
  const s = (t || "").toLowerCase();
  if (s.includes("sole")) return "SOLE_PROPRIETOR";
  if (s.includes("non")) return "NON_PROFIT";
  if (s.includes("public")) return "PUBLIC_PROFIT";
  if (s.includes("gov")) return "GOVERNMENT";
  return "PRIVATE_PROFIT";
}

function phoneE164(country: string, phone: string) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  const cc = (country || "").replace(/\D/g, "") || "1";
  return `+${cc}${digits}`;
}

export async function submitVerifierVerification(opts: {
  subaccountSid: string; phoneSid: string; existingVerificationSid: string | null;
  payload: TollfreeSubmitPayload; statusCallbackUrl: string;
}): Promise<TollfreeSubmitResult> {
  const p = opts.payload;
  if (!p.proofOfOptInUrl) throw new Error("Proof of opt-in is required. Upload a screenshot of your sign-up form in the Opt-in step.");
  const auth = await subAuthFor(opts.subaccountSid);
  const reg = (p.businessRegistrationNumber ?? "").trim();
  const fields: Array<[string, string]> = [
    ["TollfreePhoneNumberSid", opts.phoneSid], ["BusinessName", p.legalEntityName], ["BusinessWebsite", p.websiteUrl],
    ["BusinessType", businessType(p.businessType)],
    ...(reg ? ([["BusinessRegistrationNumber", reg], ["BusinessRegistrationAuthority", (p.businessRegistrationIdentifier || "EIN").toUpperCase()], ["BusinessRegistrationCountry", (p.businessRegistrationCountry || "US").toUpperCase()]] as Array<[string, string]>) : []),
    ["BusinessStreetAddress", p.addressLine1], ...(p.addressLine2 ? ([["BusinessStreetAddress2", p.addressLine2]] as Array<[string, string]>) : []),
    ["BusinessCity", p.city], ["BusinessStateProvinceRegion", p.state], ["BusinessPostalCode", p.zip], ["BusinessCountry", (p.businessCountry || "US").toUpperCase()],
    ["BusinessContactFirstName", p.contactFirstName], ["BusinessContactLastName", p.contactLastName],
    ["BusinessContactEmail", p.contactEmail], ["BusinessContactPhone", phoneE164(p.contactPhoneCountry, p.contactPhone)],
    ["NotificationEmail", p.notificationEmail || "admin@xellvio.com"],
    ["UseCaseSummary", p.useCaseDescription], ["ProductionMessageSample", p.sampleMessage],
    ["OptInImageUrls", p.proofOfOptInUrl], ["OptInType", (p.optInType || "WEB_FORM").toUpperCase().replace(/[\s-]+/g, "_")],
    ["MessageVolume", p.monthlyVolume], ["AdditionalInformation", p.additionalInformation],
    ["PrivacyPolicyUrl", p.privacyPolicyUrl], ["TermsAndConditionsUrl", p.termsUrl],
    ["OptInKeywords", p.optInKeywords], ["AgeGatedContent", String(!!p.containsAgeGatedContent)],
    ["ExternalReferenceId", opts.phoneSid],
    ...(p.optInConfirmationMessage ? ([["OptInConfirmationMessage", p.optInConfirmationMessage]] as Array<[string, string]>) : []),
    ...(p.helpMessageSample ? ([["HelpMessageSample", p.helpMessageSample]] as Array<[string, string]>) : []),
  ];
  for (const c of p.useCaseCategories?.length ? p.useCaseCategories : ["MARKETING"]) {
    fields.push(["UseCaseCategories", c.toUpperCase().replace(/[\s-]+/g, "_")]);
  }
  const url = opts.existingVerificationSid?.startsWith("HH") ? `${TFV}/${opts.existingVerificationSid}` : TFV;
  const v = await tw(url, auth, fields);
  return { verificationSid: v.sid, status: mapTwilioStatus(v.status), rejectionReason: v.rejection_reason ?? null, raw: v };
}

export async function fetchVerifierVerification(db: any, subaccountSid: string, verificationSid: string): Promise<TollfreeSubmitResult> {
  const v = await tw(`${TFV}/${verificationSid}`, await subAuthFor(subaccountSid));
  const status = mapTwilioStatus(v.status);
  await db.from("twilio_verified_inventory").update({ verification_sid: v.sid, verification_status: status === "verified" ? "verified" : "pending" }).eq("owner_account_sid", subaccountSid);
  return { verificationSid: v.sid, status, rejectionReason: v.rejection_reason ?? null, raw: v };
}
