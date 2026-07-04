// Telnyx-backed toll-free verification server functions.
// This is a Phase-1 shim: it preserves the public API surface (exports) that
// the UI depends on, but delegates submission/refresh to Telnyx via
// tollfree-submit.server. The full wizard flow will be rewritten to Telnyx's
// verification schema in a follow-up phase.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { TOLLFREE_USE_CASES, TOLLFREE_VOLUMES, normalizeUseCase } from "./tollfree-use-cases";

const VOLUME_VALUES = TOLLFREE_VOLUMES;
const OPT_IN_VALUES = ["VERBAL","WEB_FORM","PAPER_FORM","VIA_TEXT","MOBILE_QR_CODE"] as const;

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
  useCaseCategories: z.array(z.string().transform((v) => normalizeUseCase(v) ?? v))
    .min(1).max(5)
    .refine((arr) => arr.every((v) => (TOLLFREE_USE_CASES as readonly string[]).includes(v)), {
      message: "Invalid use-case",
    }),
  proofOfOptInUrl: z.string().trim().url("Proof of opt-in URL is required (upload a screenshot or paste a public link)."),
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

type TollfreeAssetRow = {
  id: string;
  phone_number: string | null;
  telnyx_phone_number_id: string | null;
  telnyx_verification_id: string | null;
};

const tollfreeAssetSelect = "id,phone_number,telnyx_phone_number_id,telnyx_verification_id";

async function resolveTollfreeNumberId(params: {
  supabaseAdmin: any;
  userId: string;
  asset: TollfreeAssetRow;
  messagingProfileId: string;
}): Promise<TollfreeAssetRow> {
  const { supabaseAdmin, userId, asset, messagingProfileId } = params;
  if (asset.telnyx_phone_number_id || !asset.phone_number) return asset;

  const { getPhoneNumberByE164, reassignNumberToProfile, safeTelnyxCall } = await import("./telnyx.server");
  let found: { id: string; phone_number: string; messaging_profile_id: string | null } | null = null;
  try {
    found = await getPhoneNumberByE164(asset.phone_number);
  } catch (e) {
    console.warn("[tf-submit] Telnyx lookup for existing asset failed", e);
  }

  if (found?.id && found.messaging_profile_id !== messagingProfileId) {
    try {
      await safeTelnyxCall(
        "reassign_number",
        { userId, messagingProfileId },
        () => reassignNumberToProfile({ phoneNumberId: found.id, messagingProfileId }),
      );
    } catch (e) {
      console.warn("[tf-submit] Telnyx reassignment skipped; verification can still be submitted by E.164", e);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("sender_assets")
    .update({
      telnyx_phone_number_id: found?.id ?? asset.telnyx_phone_number_id,
      telnyx_messaging_profile_id: messagingProfileId,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", asset.id)
    .select(tollfreeAssetSelect)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return updated ?? { ...asset, telnyx_phone_number_id: found?.id ?? asset.telnyx_phone_number_id };
}

export const getMyTollfreeVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: asset } = await context.supabase
      .from("sender_assets")
      .select("id,phone_number,telnyx_phone_number_id,verification_status,telnyx_verification_id,verification_payload,rejection_reason,friendly_rejection_reason,submitted_at,in_review_at,verified_at,rejected_at,last_synced_at,telnyx_messaging_profile_id")
      .eq("account_id", context.userId)
      .eq("sender_kind", "toll_free")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { asset: asset ?? null };
  });

export const TOLLFREE_SETUP_FEE_USD = 5;

export const submitTollfreeVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TollfreeVerificationPayload) => TollfreeVerificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount, searchAvailableNumbers, orderNumber } = await import("./telnyx.server");
    const { submitTwilioTollfreeVerification } = await import("./tollfree-submit.server");

    // One-time $5 setup fee. If the tenant has enough credits, charge it now.
    // If they don't, defer the charge (record it as due) so provisioning is
    // never blocked by a $0 balance — it'll be auto-settled on their next top-up.
    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("tollfree_setup_fee_paid_at, tollfree_setup_fee_due_cents, credit_balance")
      .eq("id", userId)
      .maybeSingle();
    let chargedSetupFee = false;
    let deferredFee = false;
    if (!acct?.tollfree_setup_fee_paid_at) {
      if (Number(acct?.credit_balance ?? 0) >= TOLLFREE_SETUP_FEE_USD) {
        const { error: debitErr } = await supabaseAdmin.rpc("debit_account", {
          _account_id: userId,
          _amount: TOLLFREE_SETUP_FEE_USD,
          _campaign_id: null as any,
          _description: "Toll-free verification setup fee",
        });
        if (debitErr) throw new Error(debitErr.message);
        await supabaseAdmin
          .from("accounts")
          .update({ tollfree_setup_fee_paid_at: new Date().toISOString(), tollfree_setup_fee_due_cents: 0 })
          .eq("id", userId);
        chargedSetupFee = true;
      } else if (!acct?.tollfree_setup_fee_due_cents || acct.tollfree_setup_fee_due_cents < TOLLFREE_SETUP_FEE_USD * 100) {
        await supabaseAdmin
          .from("accounts")
          .update({ tollfree_setup_fee_due_cents: TOLLFREE_SETUP_FEE_USD * 100 })
          .eq("id", userId);
        deferredFee = true;
      }
    }
    void deferredFee;

    const messagingProfileId = await ensureMessagingProfileForAccount(userId);
    let { data: asset } = await supabaseAdmin
      .from("sender_assets")
      .select(tollfreeAssetSelect)
      .eq("account_id", userId).eq("sender_kind", "toll_free")
      .maybeSingle();

    if (asset) asset = await resolveTollfreeNumberId({ supabaseAdmin, userId, asset, messagingProfileId });

    if (!asset) {
      try {
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
          telnyx_phone_number_id: bought.id,
          telnyx_messaging_profile_id: messagingProfileId,
          verification_status: "pending",
        }).select(tollfreeAssetSelect).single();
        if (insErr) throw new Error(insErr.message);
        asset = inserted;
      } catch (e: any) {
        // Refund only if this submit charged the fee and purchase didn't complete.
        if (chargedSetupFee) {
          await supabaseAdmin.rpc("topup_account", {
            _account_id: userId, _amount: TOLLFREE_SETUP_FEE_USD,
            _description: "Toll-free setup refund (purchase failed)",
          });
          await supabaseAdmin.from("accounts").update({ tollfree_setup_fee_paid_at: null }).eq("id", userId);
        }
        throw e;
      }
    }

    if (!asset?.phone_number) {
      throw new Error(
        "Missing toll-free phone number for verification submission. Please reserve or assign a toll-free number, then resubmit.",
      );
    }


    const base = process.env.PUBLIC_BASE_URL ?? "https://xellvio.com";
    const result = await submitTwilioTollfreeVerification({
      phoneSid: asset.telnyx_phone_number_id ?? asset.phone_number,
      phoneNumberE164: asset.phone_number ?? undefined,
      accountSid: "",
      authToken: "",
      existingVerificationSid: asset.telnyx_verification_id ?? null,
      payload: data as any,
      statusCallbackUrl: `${base}/api/public/telnyx-status`,
    });

    await supabaseAdmin.from("sender_assets").update({
      verification_status: result.status === "verified" ? "verified" : result.status,
      telnyx_verification_id: result.verificationSid,
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
      .select("id,telnyx_verification_id,verification_status")
      .eq("account_id", context.userId).eq("sender_kind", "toll_free")
      .maybeSingle();
    if (!asset?.telnyx_verification_id) return { ok: false, status: asset?.verification_status ?? "pending" };
    const { fetchTwilioTollfreeVerification } = await import("./tollfree-submit.server");
    const result = await fetchTwilioTollfreeVerification({
      verificationSid: asset.telnyx_verification_id, accountSid: "", authToken: "",
    });
    await supabaseAdmin.from("sender_assets").update({
      verification_status: result.status === "verified" ? "verified" : result.status,
      rejection_reason: result.rejectionReason,
      last_synced_at: new Date().toISOString(),
    }).eq("id", asset.id);
    return { ok: true, status: result.status };
  });

export const getTollfreeFeeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: acct } = await context.supabase
      .from("accounts")
      .select("credit_balance, tollfree_setup_fee_paid_at")
      .eq("id", context.userId)
      .maybeSingle();
    const balance = Number(acct?.credit_balance ?? 0);
    const paid = !!acct?.tollfree_setup_fee_paid_at;
    return {
      paid,
      feeCents: TOLLFREE_SETUP_FEE_USD * 100,
      fee: TOLLFREE_SETUP_FEE_USD,
      balance,
      currency: "USD",
      note: `One-time $${TOLLFREE_SETUP_FEE_USD} covers the toll-free number rental & carrier verification. Resubmissions after a rejection are free.`,
    };
  });

export const payTollfreeFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("tollfree_setup_fee_paid_at, credit_balance")
      .eq("id", context.userId)
      .maybeSingle();
    if (acct?.tollfree_setup_fee_paid_at) return { ok: true, alreadyPaid: true };
    if (Number(acct?.credit_balance ?? 0) < TOLLFREE_SETUP_FEE_USD) {
      throw new Error(`Insufficient credit balance. Top up at least $${TOLLFREE_SETUP_FEE_USD} to continue.`);
    }
    const { error: debitErr } = await supabaseAdmin.rpc("debit_account", {
      _account_id: context.userId,
      _amount: TOLLFREE_SETUP_FEE_USD,
      _campaign_id: null as any,
      _description: "Toll-free verification setup fee",
    });
    if (debitErr) throw new Error(debitErr.message);
    await supabaseAdmin.from("accounts").update({ tollfree_setup_fee_paid_at: new Date().toISOString() }).eq("id", context.userId);
    return { ok: true, alreadyPaid: false };
  });
