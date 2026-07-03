// Telnyx-backed toll-free verification server functions.
// This is a Phase-1 shim: it preserves the public API surface (exports) that
// the UI depends on, but delegates submission/refresh to Telnyx via
// tollfree-submit.server. The full wizard flow will be rewritten to Telnyx's
// verification schema in a follow-up phase.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const VOLUME_VALUES = ["10","100","1,000","10,000","100,000","250,000","500,000","750,000","1,000,000","5,000,000+"] as const;
const OPT_IN_VALUES = ["VERBAL","WEB_FORM","PAPER_FORM","VIA_TEXT","MOBILE_QR_CODE"] as const;
const USE_CASE_CATEGORIES = [
  "TWO_FACTOR_AUTHENTICATION","ACCOUNT_NOTIFICATIONS","CUSTOMER_CARE","CHARITY_NONPROFIT",
  "DELIVERY_NOTIFICATIONS","FRAUD_ALERT_MESSAGING","EVENTS","HIGHER_EDUCATION","K12",
  "MARKETING","POLLING_AND_VOTING_NON_POLITICAL","POLITICAL_ELECTION_CAMPAIGNS",
  "PUBLIC_SERVICE_ANNOUNCEMENT","SECURITY_ALERT",
] as const;

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
  businessCountry: z.string().trim().length(2).default("US"),
  addressLine1: z.string().trim().min(2).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  zip: z.string().trim().min(3).max(20),
  monthlyVolume: z.enum(VOLUME_VALUES),
  optInType: z.enum(OPT_IN_VALUES),
  useCaseCategories: z.array(z.enum(USE_CASE_CATEGORIES)).min(1).max(5),
  proofOfOptInUrl: z.string().trim().url().optional().or(z.literal("")),
  proofShowsRequiredConsent: z.literal(true),
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

export const getMyTollfreeVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: asset } = await context.supabase
      .from("sender_assets")
      .select("id,phone_number,phone_sid,verification_status,verification_sid,verification_payload,rejection_reason,friendly_rejection_reason,submitted_at,in_review_at,verified_at,rejected_at,last_synced_at,telnyx_phone_number_id,telnyx_messaging_profile_id")
      .eq("account_id", context.userId)
      .eq("sender_kind", "toll_free")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { asset: asset ?? null };
  });

export const submitTollfreeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TollfreeVerificationPayload) => TollfreeVerificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount, searchAvailableNumbers, orderNumber } = await import("./telnyx.server");
    const { submitTwilioTollfreeVerification } = await import("./tollfree-submit.server");

    const messagingProfileId = await ensureMessagingProfileForAccount(userId);
    let { data: asset } = await supabaseAdmin
      .from("sender_assets")
      .select("id,phone_number,phone_sid,verification_sid")
      .eq("account_id", userId).eq("sender_kind", "toll_free")
      .maybeSingle();

    // If no toll-free asset yet, buy one on Telnyx into the tenant's profile.
    if (!asset) {
      const avail = await searchAvailableNumbers({ country: data.businessCountry || "US", numberType: "toll-free", limit: 5 });
      const pick = avail[0];
      if (!pick) throw new Error("No toll-free numbers are available right now.");
      const order = await orderNumber({ phoneNumber: pick.phone_number, messagingProfileId });
      const bought = order.phone_numbers?.[0];
      if (!bought) throw new Error("Telnyx did not return a purchased number.");
      const { data: inserted, error: insErr } = await supabaseAdmin.from("sender_assets").insert({
        account_id: userId,
        country_code: (data.businessCountry || "US").toUpperCase(),
        sender_kind: "toll_free",
        phone_number: bought.phone_number,
        phone_sid: bought.id,
        telnyx_phone_number_id: bought.id,
        telnyx_messaging_profile_id: messagingProfileId,
        messaging_service_sid: messagingProfileId,
        verification_status: "pending",
      }).select("id,phone_number,phone_sid,verification_sid").single();
      if (insErr) throw new Error(insErr.message);
      asset = inserted;
    }

    if (!asset?.phone_sid) throw new Error("No toll-free number id on file for this account.");

    const base = process.env.PUBLIC_BASE_URL ?? "https://xellvio.com";
    const result = await submitTwilioTollfreeVerification({
      phoneSid: asset.phone_sid,
      accountSid: "",
      authToken: "",
      existingVerificationSid: asset.verification_sid ?? null,
      payload: data as any,
      statusCallbackUrl: `${base}/api/public/telnyx-status`,
    });

    await supabaseAdmin.from("sender_assets").update({
      verification_status: result.status === "verified" ? "verified" : result.status,
      verification_sid: result.verificationSid,
      verification_payload: data as any,
      rejection_reason: result.rejectionReason,
      submitted_at: new Date().toISOString(),
    }).eq("id", asset.id);

    return { ok: true, verificationSid: result.verificationSid, status: result.status, friendlyRejectionReason: result.rejectionReason ?? null };
  });

export const refreshTollfreeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: asset } = await supabaseAdmin
      .from("sender_assets")
      .select("id,verification_sid,verification_status")
      .eq("account_id", context.userId).eq("sender_kind", "toll_free")
      .maybeSingle();
    if (!asset?.verification_sid) return { ok: false, status: asset?.verification_status ?? "pending" };
    const { fetchTwilioTollfreeVerification } = await import("./tollfree-submit.server");
    const result = await fetchTwilioTollfreeVerification({
      verificationSid: asset.verification_sid, accountSid: "", authToken: "",
    });
    await supabaseAdmin.from("sender_assets").update({
      verification_status: result.status === "verified" ? "verified" : result.status,
      rejection_reason: result.rejectionReason,
    }).eq("id", asset.id);
    return { ok: true, status: result.status };
  });

export const getTollfreeFeeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const zeroMoney = { amount: 0, amount_cents: 0, currency: "USD", label: "$0.00" };
    return {
      paid: true,
      feeCents: 0,
      fee: 0 as number,
      balance: 0 as number,
      currency: "USD",
      note: "Telnyx does not charge a separate toll-free verification fee.",
      _money: zeroMoney, // reserved for future currency-aware UI
    };
  });

export const payTollfreeFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { ok: true, note: "Telnyx: no verification fee required." };
  });
