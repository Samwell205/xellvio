// Auto-buy a US/CA toll-free or local number on Telnyx and attach it to a
// tenant's Messaging Profile. Replaces the previous Twilio-based helper.

import {
  searchAvailableNumbers,
  orderNumber,
  ensureMessagingProfileForAccount,
  safeTelnyxCall,
} from "./telnyx.server";

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

export type AutoReviewResult = { ok: true } | { ok: false; reason: string };

export function autoReview(input: AutoReviewInput): AutoReviewResult {
  if (input.number_type === "short_code") {
    return { ok: false, reason: "Short codes require a manual carrier registration and cannot be auto-provisioned." };
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

/**
 * Buy a fresh number on Telnyx and attach it to the given account's Messaging
 * Profile. Returns provider identifiers we persist for later reference.
 */
export async function autoPurchaseNumber(input: {
  country: "US" | "CA";
  number_type: "toll_free" | "ten_dlc";
  accountId: string;
  friendlyName: string;
}): Promise<{ id: string; phone_number: string; messaging_profile_id: string }> {
  const messagingProfileId = await ensureMessagingProfileForAccount(input.accountId);
  const numberType = input.number_type === "toll_free" ? "toll-free" : "local";
  const available = await safeTelnyxCall(
    "search_numbers",
    { userId: input.accountId, messagingProfileId },
    () => searchAvailableNumbers({ country: input.country, numberType, limit: 5 }),
  );
  const pick = available[0];
  if (!pick) throw new Error(`No ${input.number_type === "toll_free" ? "toll-free" : "local"} numbers available right now in ${input.country}.`);

  const order = await safeTelnyxCall(
    "order_number",
    { userId: input.accountId, messagingProfileId },
    () => orderNumber({ phoneNumber: pick.phone_number, messagingProfileId }),
  );
  const purchased = order.phone_numbers?.[0];
  if (!purchased) throw new Error("Telnyx accepted the order but returned no phone number");

  // Persist to numbers table (mirror + audit)
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("numbers").upsert({
    account_id: input.accountId,
    phone_number: purchased.phone_number,
    telnyx_number_id: purchased.id,
    telnyx_messaging_profile_id: messagingProfileId,
    country_code: input.country,
    number_type: input.number_type,
    status: "active",
  }, { onConflict: "phone_number" });

  return {
    id: purchased.id,
    phone_number: purchased.phone_number,
    messaging_profile_id: messagingProfileId,
  };
}
