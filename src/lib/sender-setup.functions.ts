import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SetupInput, type SetupSmsPayload } from "./sender-setup.schema";
import { ALPHA_SENDER_REQUIRES_REGISTRATION_SET, ALPHA_SENDER_UNSUPPORTED_SET } from "./countries";
import { resolveActingAccount, assertPermission } from "@/lib/acting-account.server";


export const setupSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SetupSmsPayload) => SetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { setupSmsForUser } = await import("./sender-setup.server");
    return setupSmsForUser(context.userId, data);
  });

export const getMySenderAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("sender_assets")
      .select("id,country_code,sender_kind,phone_number,telnyx_messaging_profile_id,verification_status,rejection_reason,friendly_rejection_reason,telnyx_verification_id,submitted_at,in_review_at,verified_at,rejected_at,last_synced_at,telnyx_phone_number_id")
      .eq("account_id", context.userId)
      .order("country_code", { ascending: true });
    const rows = data ?? [];
    const readySenderIds = rows.filter(
      (asset) =>
        asset.sender_kind === "sender_id" &&
        !ALPHA_SENDER_UNSUPPORTED_SET.has(asset.country_code) &&
        !ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(asset.country_code) &&
        asset.verification_status !== "verified",
    );
    if (readySenderIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("sender_assets")
        .update({ verification_status: "verified", rejection_reason: null, last_synced_at: new Date().toISOString() })
        .eq("account_id", context.userId)
        .in("id", readySenderIds.map((asset) => asset.id));
    }
    return rows.map((asset) =>
      asset.sender_kind === "sender_id" &&
      !ALPHA_SENDER_UNSUPPORTED_SET.has(asset.country_code) &&
      !ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(asset.country_code)
        ? { ...asset, verification_status: "verified", rejection_reason: null }
        : asset,
    );
  });

export const refreshMyVerificationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Telnyx TF verification uses its own polling endpoint; this is a no-op
    // stub because inbound webhooks push status updates in real time.
    const { data } = await context.supabase
      .from("sender_assets").select("id").eq("account_id", context.userId);
    return { checked: (data ?? []).length, updated: 0 };
  });

const CustomSenderInput = z.object({
  countries: z.array(z.string().length(2)).min(1),
  senderId: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.string().regex(/^(?=.*[A-Z])[A-Z0-9 ]{1,11}$/, "Sender ID must be 1–11 letters, numbers, or spaces and include at least one letter"),
  ),
});

export const saveCustomSenderId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof CustomSenderInput>) => CustomSenderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount, createAlphanumericSenderId } = await import("./telnyx.server");
    const { ALPHA_SENDER_REQUIRES_REGISTRATION_SET, ALPHA_SENDER_UNSUPPORTED_SET } = await import("./countries");
    const messagingProfileId = await ensureMessagingProfileForAccount(userId);
    const results: Array<{ cc: string; status: string }> = [];
    for (const raw of data.countries) {
      const cc = raw.toUpperCase();
      if (ALPHA_SENDER_UNSUPPORTED_SET.has(cc)) {
        throw new Error(`${cc} does not support alphanumeric Sender ID on Telnyx. Use toll-free verification instead.`);
      }
      const needsReg = ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(cc);
      let status = needsReg ? "submitted" : "verified";
      let alphaSenderId: string | null = null;
      let telnyxError: string | null = null;
      try {
        const alpha = await createAlphanumericSenderId({
          messagingProfileId,
          senderId: data.senderId,
          isoCountryCode: cc,
        });
        alphaSenderId = alpha.id ?? null;
      } catch (e: any) {
        telnyxError = String(e?.message ?? e);
        const telnyxErrorText = telnyxError.toLowerCase();
        const alreadyExists = telnyxErrorText.includes("already") || telnyxErrorText.includes("duplicate");
        status = needsReg ? (alreadyExists ? "submitted" : "requires_registration") : "verified";
      }
      const { data: existing } = await supabaseAdmin
        .from("sender_assets").select("id").eq("account_id", userId).eq("country_code", cc).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("sender_assets").update({
          sender_kind: "sender_id",
          phone_number: data.senderId,
          telnyx_messaging_profile_id: messagingProfileId,
          telnyx_verification_id: alphaSenderId,
          verification_status: status,
          rejection_reason: telnyxError,
          submitted_at: status === "submitted" || status === "requires_registration" ? new Date().toISOString() : null,
          last_synced_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("sender_assets").insert({
          account_id: userId,
          country_code: cc,
          sender_kind: "sender_id",
          phone_number: data.senderId,
          telnyx_messaging_profile_id: messagingProfileId,
          telnyx_verification_id: alphaSenderId,
          verification_status: status,
          rejection_reason: telnyxError,
          submitted_at: status === "submitted" || status === "requires_registration" ? new Date().toISOString() : null,
        });
      }
      results.push({ cc, status });
    }
    return {
      ok: true,
      senderId: data.senderId,
      countries: data.countries,
      requiresRegistration: results.filter(r => r.status === "requires_registration").map(r => r.cc),
    };
  });

const SenderRegistrationInput = z.object({
  country: z.string().length(2),
  senderId: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().regex(/^(?=.*[A-Z])[A-Z0-9 ]{1,11}$/, "Sender ID must be 1–11 letters, numbers, or spaces and include at least one letter"),
  ),
  businessName: z.string().trim().min(2).max(200).optional(),
  businessWebsite: z.string().trim().url().max(300).optional(),
  useCase: z.string().trim().min(3).max(120).optional(),
  sampleMessage: z.string().trim().min(10).max(1000).optional(),
  optInDescription: z.string().trim().min(10).max(1000).optional(),
  monthlyVolume: z.number().int().positive().max(100_000_000).optional(),
});

/**
 * Collect registration details on our platform and submit to Telnyx so the
 * user never has to open the carrier portal directly.
 */
export const submitSenderIdRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof SenderRegistrationInput>) => SenderRegistrationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount, createAlphanumericSenderId } = await import("./telnyx.server");
    const cc = data.country.toUpperCase();
    const messagingProfileId = await ensureMessagingProfileForAccount(userId);

    // Persist optional business context only if the user already provided it.
    const accountPatch: {
      legal_business_name?: string;
      website_url?: string;
      use_case_description?: string;
      sample_message?: string;
      opt_in_description?: string;
      monthly_volume_estimate?: number;
    } = {};
    if (data.businessName) accountPatch.legal_business_name = data.businessName;
    if (data.businessWebsite) accountPatch.website_url = data.businessWebsite;
    if (data.useCase) accountPatch.use_case_description = data.useCase;
    if (data.sampleMessage) accountPatch.sample_message = data.sampleMessage;
    if (data.optInDescription) accountPatch.opt_in_description = data.optInDescription;
    if (data.monthlyVolume) accountPatch.monthly_volume_estimate = data.monthlyVolume;
    if (Object.keys(accountPatch).length > 0) {
      await supabaseAdmin.from("accounts").update(accountPatch).eq("id", userId);
    }

    let submittedStatus: "submitted" | "requires_registration" = "submitted";
    let telnyxError: string | null = null;
    let alphaSenderId: string | null = null;
    try {
      const alpha = await createAlphanumericSenderId({
        messagingProfileId,
        senderId: data.senderId,
        isoCountryCode: cc,
      });
      alphaSenderId = alpha.id ?? null;
    } catch (e: any) {
      // Some carriers require truly manual pre-registration and Telnyx returns
      // 400/422 telling us so. Keep the record but flag it as pending manual review.
      telnyxError = e?.message ?? String(e);
      submittedStatus = "requires_registration";
    }

    const { data: existing } = await supabaseAdmin
      .from("sender_assets").select("id").eq("account_id", userId).eq("country_code", cc).maybeSingle();
    const patch = {
      sender_kind: "sender_id" as const,
      phone_number: data.senderId,
      telnyx_messaging_profile_id: messagingProfileId,
      telnyx_verification_id: alphaSenderId,
      verification_status: submittedStatus,
      rejection_reason: telnyxError,
      submitted_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    };
    if (existing) {
      await supabaseAdmin.from("sender_assets").update(patch).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("sender_assets").insert({ account_id: userId, country_code: cc, ...patch });
    }
    return { ok: true, status: submittedStatus, error: telnyxError };
  });
