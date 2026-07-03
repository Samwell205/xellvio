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
      .select("id,country_code,sender_kind,phone_number,messaging_service_sid,verification_status,rejection_reason,friendly_rejection_reason,verification_sid,submitted_at,in_review_at,verified_at,rejected_at,last_synced_at,telnyx_phone_number_id,telnyx_messaging_profile_id")
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
    const messagingProfileId = await ensureMessagingProfileForAccount(userId);
    for (const raw of data.countries) {
      const cc = raw.toUpperCase();
      const { data: existing } = await supabaseAdmin
        .from("sender_assets").select("id").eq("account_id", userId).eq("country_code", cc).maybeSingle();
      if (existing) {
        await supabaseAdmin.from("sender_assets").update({
          sender_kind: "sender_id",
          phone_number: data.senderId,
          messaging_service_sid: messagingProfileId,
          telnyx_messaging_profile_id: messagingProfileId,
          verification_status: "verified",
          last_synced_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("sender_assets").insert({
          account_id: userId,
          country_code: cc,
          sender_kind: "sender_id",
          phone_number: data.senderId,
          messaging_service_sid: messagingProfileId,
          telnyx_messaging_profile_id: messagingProfileId,
          verification_status: "verified",
        });
      }
    }
    return { ok: true, senderId: data.senderId, countries: data.countries };
  });
