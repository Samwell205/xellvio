// Tenant-facing Telnyx provisioning server fns.
// Provisions the tenant's Messaging Profile, searches Telnyx numbers,
// and purchases them into that profile.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const provisionSubaccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error } = await supabaseAdmin
      .from("accounts")
      .select("id,legal_business_name,onboarding_status,telnyx_messaging_profile_id")
      .eq("id", userId).maybeSingle();
    if (error || !acct) throw new Error("Account not found");
    if (acct.onboarding_status === "suspended") throw new Error("Account suspended");
    if (!acct.legal_business_name) throw new Error("Complete your business profile first");
    if (acct.telnyx_messaging_profile_id) {
      return { subaccount_sid: acct.telnyx_messaging_profile_id, already: true };
    }
    const { ensureMessagingProfileForAccount } = await import("./telnyx.server");
    const id = await ensureMessagingProfileForAccount(userId);
    return { subaccount_sid: id, already: false };
  });

export const searchNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { country: string; areaCode?: string; numberType?: "local" | "toll-free" | "mobile" | "national" }) =>
    z.object({
      country: z.string().length(2),
      areaCode: z.string().optional(),
      numberType: z.enum(["local", "toll-free", "mobile", "national"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { searchAvailableNumbers } = await import("./telnyx.server");
    const list = await searchAvailableNumbers({
      country: data.country,
      numberType: data.numberType,
      areaCode: data.areaCode,
      limit: 20,
    });
    return list.map((n) => ({
      phone_number: n.phone_number,
      friendly_name: n.phone_number,
      region: n.region_information?.[0]?.region_name ?? null,
      cost: n.cost_information ?? null,
      capabilities: { SMS: true, MMS: true, voice: (n.features ?? []).some((f) => f.name === "voice") },
    }));
  });

export const purchaseNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phoneNumber: string }) =>
    z.object({ phoneNumber: z.string().regex(/^\+\d{6,15}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount, orderNumber, safeTelnyxCall } = await import("./telnyx.server");

    const { data: acct } = await supabaseAdmin
      .from("accounts").select("subaccount_phone_sid").eq("id", userId).maybeSingle();
    if (acct?.subaccount_phone_sid) throw new Error("A number is already provisioned for this account");

    const messagingProfileId = await ensureMessagingProfileForAccount(userId);
    const order = await safeTelnyxCall(
      "purchase_number",
      { userId, messagingProfileId },
      () => orderNumber({ phoneNumber: data.phoneNumber, messagingProfileId }),
    );
    const purchased = order.phone_numbers?.[0];
    if (!purchased) throw new Error("Telnyx accepted the order but did not return a phone number");

    await supabaseAdmin.from("numbers").upsert({
      account_id: userId,
      phone_number: purchased.phone_number,
      telnyx_number_id: purchased.id,
      telnyx_messaging_profile_id: messagingProfileId,
      status: "active",
    }, { onConflict: "phone_number" });

    await supabaseAdmin.from("accounts").update({
      subaccount_phone_number: purchased.phone_number,
      subaccount_phone_sid: purchased.id,
      subaccount_messaging_service_sid: messagingProfileId,
      onboarding_status: "active",
    }).eq("id", userId);

    return { phone_number: purchased.phone_number, sid: purchased.id };
  });
