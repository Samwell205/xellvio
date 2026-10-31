// Dedicated toll-free lines: one separate Twilio subaccount per business,
// requested by the business and charged to its Xellvio credit. Tenant UI must
// never name the provider.

const API = "https://api.twilio.com/2010-04-01";

function parentAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error("Dedicated numbers are temporarily unavailable.");
  return "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
}
const subAuth = (sid: string, tok: string) => "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");

async function tw(url: string, auth: string, body?: URLSearchParams | Array<[string, string]>): Promise<any> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? (body instanceof URLSearchParams ? body : new URLSearchParams(body)) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[twilio-lines] ${res.status} ${url}: ${JSON.stringify(j).slice(0, 400)}`);
    const err = new Error(String(j?.message ?? `Request failed (${res.status})`).replace(/twilio/gi, "carrier"));
    (err as any).status = res.status;
    throw err;
  }
  return j;
}

export type LineBusiness = {
  businessName: string; website: string; ein?: string;
  street: string; city: string; state: string; postalCode: string; country: string;
  contactFirstName: string; contactLastName: string; contactEmail: string; contactPhone: string;
  privacyUrl: string; termsUrl: string; optInImageUrl: string;
  useCaseSummary: string; sampleMessage: string; monthlyVolume: string;
};

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export async function lineTokenFor(accountSid: string): Promise<string | null> {
  if (accountSid === process.env.TWILIO_ACCOUNT_SID) return process.env.TWILIO_AUTH_TOKEN ?? null;
  const db = await admin();
  const { data } = await db.from("tenant_twilio_lines").select("auth_token_enc").eq("subaccount_sid", accountSid).not("auth_token_enc","is",null).limit(1).maybeSingle();
  if (data?.auth_token_enc) {
    const { data: tok } = await db.rpc("decrypt_twilio_token", { _cipher: data.auth_token_enc });
    if (tok) return tok;
  }
  // Stored token unreadable: the parent account can always read its subaccount's token.
  try {
    const a = await tw(`${API}/Accounts/${accountSid}.json`, parentAuth());
    return a?.auth_token ?? null;
  } catch (e) {
    console.error("[twilio-lines] subaccount token lookup failed", e);
    return null;
  }
}

export function lineWebhookBase(): string {
  return "https://xellvio.com/api/public/twilio";
}

/** Creates subaccount → buys toll-free number → submits verification. Resumable. */
export async function provisionLine(accountId: string, biz: LineBusiness): Promise<{ status: string; phone: string | null }> {
  const db = await admin();
  const { data: row } = await db.from("tenant_twilio_lines").select("*").eq("account_id", accountId).maybeSingle();
  if (!row) throw new Error("Request not found.");
  let { subaccount_sid: subSid, phone_sid: phoneSid, phone_number: phone } = row;
  let token: string | null = subSid ? await lineTokenFor(subSid) : null;

  if (!subSid || !token) {
    const acct = await tw(`${API}/Accounts.json`, parentAuth(), new URLSearchParams({ FriendlyName: `xellvio-${accountId}` }));
    subSid = acct.sid; token = acct.auth_token;
    const { data: enc } = await db.rpc("encrypt_twilio_token", { _plain: token });
    await db.from("tenant_twilio_lines").update({ subaccount_sid: subSid, auth_token_enc: enc, status: "account_created", updated_at: new Date().toISOString() }).eq("account_id", accountId);
  }
  const auth = subAuth(subSid!, token!);

  if (!phoneSid) {
    const avail = await tw(`${API}/Accounts/${subSid}/AvailablePhoneNumbers/US/TollFree.json?SmsEnabled=true&PageSize=5`, auth);
    const pick = avail?.available_phone_numbers?.[0]?.phone_number;
    if (!pick) throw new Error("No toll-free numbers are available right now. Please try again later.");
    const bought = await tw(`${API}/Accounts/${subSid}/IncomingPhoneNumbers.json`, auth, new URLSearchParams({
      PhoneNumber: pick, FriendlyName: biz.businessName.slice(0, 60),
      SmsUrl: `${lineWebhookBase()}/inbound`, SmsMethod: "POST",
    }));
    phoneSid = bought.sid; phone = bought.phone_number;
    const now = new Date();
    const renews = new Date(now); renews.setMonth(renews.getMonth() + 1);
    await db.from("tenant_twilio_lines").update({ phone_sid: phoneSid, phone_number: phone, status: "number_purchased", renews_at: renews.toISOString(), updated_at: now.toISOString() }).eq("account_id", accountId);
  }

  const fields: Array<[string, string]> = [
    ["TollfreePhoneNumberSid", phoneSid!], ["BusinessName", biz.businessName], ["BusinessWebsite", biz.website],
    ...(biz.ein
      ? ([["BusinessType", "PRIVATE_PROFIT"], ["BusinessRegistrationNumber", biz.ein], ["BusinessRegistrationAuthority", "EIN"], ["BusinessRegistrationCountry", "US"]] as Array<[string, string]>)
      : ([["BusinessType", "SOLE_PROPRIETOR"]] as Array<[string, string]>)),
    ["BusinessStreetAddress", biz.street], ["BusinessCity", biz.city],
    ["BusinessStateProvinceRegion", biz.state], ["BusinessPostalCode", biz.postalCode], ["BusinessCountry", biz.country],
    ["BusinessContactFirstName", biz.contactFirstName], ["BusinessContactLastName", biz.contactLastName],
    ["BusinessContactEmail", biz.contactEmail], ["BusinessContactPhone", biz.contactPhone],
    ["NotificationEmail", "admin@xellvio.com"], ["UseCaseCategories", "MARKETING"],
    ["UseCaseSummary", biz.useCaseSummary], ["ProductionMessageSample", biz.sampleMessage],
    ["OptInImageUrls", biz.optInImageUrl], ["OptInType", "WEB_FORM"], ["MessageVolume", biz.monthlyVolume],
    ["PrivacyPolicyUrl", biz.privacyUrl], ["TermsAndConditionsUrl", biz.termsUrl],
    ["OptInConfirmationMessage", `${biz.businessName}: You're subscribed to texts. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`],
    ["HelpMessageSample", `${biz.businessName}: For help contact ${biz.contactEmail}. Reply STOP to opt out.`],
    ["AgeGatedContent", "false"],
  ];
  const url = row.verification_sid
    ? `https://messaging.twilio.com/v1/Tollfree/Verifications/${row.verification_sid}`
    : "https://messaging.twilio.com/v1/Tollfree/Verifications";
  const v = await tw(url, auth, fields);
  await db.from("tenant_twilio_lines").update({ verification_sid: v.sid, status: "verification_pending", status_detail: null, updated_at: new Date().toISOString() }).eq("account_id", accountId);
  await (await import("./twilio-line-notify.server")).notifyLineStatus(accountId).catch((e) => console.error("[toll-free email]", e));
  return { status: "verification_pending", phone };
}

/** Pulls the latest verification result. */
export async function refreshLine(accountId: string): Promise<void> {
  const db = await admin();
  const { data: row } = await db.from("tenant_twilio_lines").select("subaccount_sid,verification_sid,status").eq("account_id", accountId).maybeSingle();
  if (!row?.subaccount_sid) return;
  const token = await lineTokenFor(row.subaccount_sid);
  if (!token) return;
  let v;
  if (row.verification_sid) {
    v = await tw(`https://messaging.twilio.com/v1/Tollfree/Verifications/${row.verification_sid}`, subAuth(row.subaccount_sid, token));
  } else {
    const { data: line } = await db.from('tenant_twilio_lines').select('phone_sid').eq('account_id', accountId).maybeSingle();
    const result = await tw(`https://messaging.twilio.com/v1/Tollfree/Verifications?TollfreePhoneNumberSid=${line?.phone_sid ?? ''}&PageSize=50`, subAuth(row.subaccount_sid, token));
    v = result.verifications?.find((item: any) => item.tollfree_phone_number_sid === line?.phone_sid);
    if (!v) return;
  }
  const { mapVerification } = await import("./twilio-lines-rules");
  const next = mapVerification(v.status);
  await db.from("tenant_twilio_lines").update({
    verification_sid: v.sid,
    status: next, status_detail: next === "rejected" ? String(v.rejection_reason ?? "Carrier review rejected the request.").slice(0, 300) : null,
    updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  await (await import("./twilio-line-notify.server")).notifyLineStatus(accountId).catch((e) => console.error("[toll-free email]", e));
}

/** Active, paid-up dedicated line for this business, or null. */
export async function activeLineFor(accountId: string): Promise<{ sid: string; token: string; from: string } | null> {
  const db = await admin();
  const { data } = await db.from("tenant_twilio_lines").select("subaccount_sid,phone_number,status,billing_status").eq("account_id", accountId).maybeSingle();
  let v: { sid: string; token: string; from: string } | null = null;
  if (data?.status === "active" && data.billing_status === "current" && data.subaccount_sid && data.phone_number) {
    const token = await lineTokenFor(data.subaccount_sid);
    if (token) v = { sid: data.subaccount_sid, token, from: data.phone_number };
  }
  return v;
}

export async function sendViaLine(line: { sid: string; token: string; from: string }, opts: { to: string; text: string; timeoutMs?: number }): Promise<{ id: string; parts: number }> {
  const res = await fetch(`${API}/Accounts/${line.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: subAuth(line.sid, line.token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: opts.to, From: line.from, Body: opts.text, StatusCallback: `${lineWebhookBase()}/status` }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.sid) {
    const err = new Error(`Dedicated number refused the message${j?.message ? `: ${String(j.message).replace(/twilio/gi, "carrier").slice(0, 200)}` : ""}`);
    (err as any).lineStatus = res.status;
    (err as any).lineCode = j?.code ?? null;
    throw err;
  }
  return { id: j.sid, parts: Number(j.num_segments) || 1 };
}
