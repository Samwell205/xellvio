import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SetupInput, type SetupSmsPayload } from "./sender-setup.schema";

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
    return data ?? [];
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
    z.string().regex(/^[A-Z0-9]{3,11}$/, "Sender ID must be 3–11 letters or numbers"),
  ),
});

export const saveCustomSenderId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof CustomSenderInput>) => CustomSenderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount } = await import("./telnyx.server");
    const { ALPHA_SENDER_REQUIRES_REGISTRATION_SET } = await import("./countries");
    const messagingProfileId = await ensureMessagingProfileForAccount(userId);
    const results: Array<{ cc: string; status: string }> = [];
    for (const raw of data.countries) {
      const cc = raw.toUpperCase();
      const needsReg = ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(cc);
      const status = needsReg ? "requires_registration" : "verified";
      const { data: existing } = await supabaseAdmin
        .from("sender_assets").select("id").eq("account_id", userId).eq("country_code", cc).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("sender_assets").update({
          sender_kind: "sender_id",
          phone_number: data.senderId,
          telnyx_messaging_profile_id: messagingProfileId,
          verification_status: status,
          last_synced_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("sender_assets").insert({
          account_id: userId,
          country_code: cc,
          sender_kind: "sender_id",
          phone_number: data.senderId,
          telnyx_messaging_profile_id: messagingProfileId,
          verification_status: status,
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
    z.string().regex(/^[A-Z0-9]{3,11}$/, "Sender ID must be 3–11 letters or numbers"),
  ),
  businessName: z.string().trim().min(2).max(200),
  businessWebsite: z.string().trim().url().max(300),
  useCase: z.string().trim().min(3).max(120),
  sampleMessage: z.string().trim().min(10).max(1000),
  optInDescription: z.string().trim().min(10).max(1000),
  monthlyVolume: z.number().int().positive().max(100_000_000),
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

    // Persist business context on the account (used for auditing / carrier docs).
    await supabaseAdmin.from("accounts").update({
      legal_business_name: data.businessName,
      website_url: data.businessWebsite,
      use_case_description: data.useCase,
      sample_message: data.sampleMessage,
      opt_in_description: data.optInDescription,
      monthly_volume_estimate: data.monthlyVolume,
    }).eq("id", userId);

    let submittedStatus: "submitted" | "requires_registration" = "submitted";
    let telnyxError: string | null = null;
    try {
      await createAlphanumericSenderId({
        messagingProfileId,
        senderId: data.senderId,
        isoCountryCode: cc,
      });
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
