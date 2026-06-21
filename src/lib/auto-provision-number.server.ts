// Server-only helpers to auto-review and auto-purchase a US/CA number on
// Twilio when a customer submits a number request. Short codes are never
// auto-provisioned (carrier process is weeks-long and manual).

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function masterAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio master credentials not configured");
  return { sid, token };
}

function basic(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function twilio<T = any>(path: string, opts: { method?: string; body?: Record<string, string> } = {}): Promise<T> {
  const { sid, token } = masterAuth();
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      Authorization: basic(sid, token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (opts.body) init.body = new URLSearchParams(opts.body).toString();
  const res = await fetch(`${TWILIO_API}/Accounts/${sid}${path}`, init);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Twilio ${res.status}: ${json?.message ?? "request failed"}`);
    (err as any).code = json?.code;
    throw err;
  }
  return json as T;
}

// Conservative content rules. If matched, request stays pending for human review.
const BANNED_PATTERNS = [
  /\b(loan|payday|bitcoin|crypto|forex|casino|gambling|porn|escort|cannabis|cbd|kratom|weed)\b/i,
  /\b(guaranteed (income|profit)|get rich|click here to win)\b/i,
];

export type AutoReviewInput = {
  country: "US" | "CA";
  number_type: "toll_free" | "ten_dlc" | "short_code";
  business_name: string;
  business_website?: string | null;
  use_case: string;
  sample_message: string;
  expected_monthly_volume: number;
};

export type AutoReviewResult =
  | { ok: true }
  | { ok: false; reason: string };

export function autoReview(input: AutoReviewInput): AutoReviewResult {
  if (input.number_type === "short_code") {
    return { ok: false, reason: "Short codes require a manual carrier registration (4–8 weeks). Our team will follow up." };
  }
  if (input.use_case.trim().length < 30) {
    return { ok: false, reason: "Use case is too short for automatic approval — please describe your messaging program in more detail." };
  }
  for (const re of BANNED_PATTERNS) {
    if (re.test(input.sample_message) || re.test(input.use_case)) {
      return { ok: false, reason: "Content falls in a restricted category that requires manual carrier vetting." };
    }
  }
  if (input.number_type === "toll_free" && input.expected_monthly_volume > 200_000) {
    return { ok: false, reason: "High-volume toll-free traffic requires manual Toll-Free Verification before provisioning." };
  }
  if (input.number_type === "ten_dlc" && input.expected_monthly_volume > 100_000) {
    return { ok: false, reason: "High-volume 10DLC traffic requires manual brand/campaign registration before provisioning." };
  }
  return { ok: true };
}

type Available = { phone_number: string; friendly_name?: string };

async function searchAvailable(country: "US" | "CA", numberType: "toll_free" | "ten_dlc"): Promise<Available | null> {
  const bucket = numberType === "toll_free" ? "TollFree" : "Local";
  const qs = new URLSearchParams({ SmsEnabled: "true", PageSize: "5" }).toString();
  const result = await twilio<{ available_phone_numbers: Available[] }>(
    `/AvailablePhoneNumbers/${country}/${bucket}.json?${qs}`,
  );
  return result.available_phone_numbers?.[0] ?? null;
}

export async function autoPurchaseNumber(input: { country: "US" | "CA"; number_type: "toll_free" | "ten_dlc"; friendlyName: string }) {
  const available = await searchAvailable(input.country, input.number_type);
  if (!available) throw new Error(`No ${input.number_type === "toll_free" ? "toll-free" : "local"} numbers available right now in ${input.country}.`);

  const base = process.env.PUBLIC_BASE_URL ?? "https://xellvio.com";
  const body: Record<string, string> = {
    PhoneNumber: available.phone_number,
    FriendlyName: input.friendlyName.slice(0, 64),
    SmsUrl: `${base}/api/public/twilio-inbound`,
    StatusCallback: `${base}/api/public/twilio-status`,
  };
  const purchased = await twilio<{ sid: string; phone_number: string }>(
    `/IncomingPhoneNumbers.json`,
    { method: "POST", body },
  );
  return purchased;
}
