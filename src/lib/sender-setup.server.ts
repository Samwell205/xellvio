// Tenant SMS setup: provisions a Messaging Profile + per-country sender for
// each target country. For US/CA we buy a Telnyx toll-free number and mark it
// pending TF verification (which the tenant completes via the dedicated
// toll-free wizard). For everywhere else we register an alphanumeric sender
// ID; Telnyx routes it via the tenant's Messaging Profile.

import type { SetupSmsPayload } from "./sender-setup.schema";

function pickSenderKind(country: string): "toll_free" | "sender_id" {
  const cc = country.toUpperCase();
  return cc === "US" || cc === "CA" ? "toll_free" : "sender_id";
}

function senderIdFromName(name: string, requested?: string): string {
  const cleaned = (requested || name || "Sender").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 11);
  return cleaned.length >= 3 ? cleaned : (cleaned + "SMS").slice(0, 11);
}

export async function setupSmsForUser(userId: string, data: SetupSmsPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureMessagingProfileForAccount, searchAvailableNumbers, orderNumber, safeTelnyxCall } =
    await import("./telnyx.server");

  const { data: acct, error } = await supabaseAdmin
    .from("accounts")
    .select("id,legal_business_name,business_address,website_url,contact_email,full_name,phone,onboarding_status,subaccount_phone_number,subaccount_messaging_service_sid,telnyx_messaging_profile_id")
    .eq("id", userId).maybeSingle();
  if (error || !acct) throw new Error("Account not found");
  if (acct.onboarding_status === "suspended") throw new Error("Account suspended");
  if (!acct.legal_business_name || !acct.business_address || !acct.website_url || !acct.contact_email) {
    throw new Error("Please complete your business profile first (legal name, address, website, contact email).");
  }

  await supabaseAdmin.from("accounts").update({
    sms_target_countries: data.targetCountries,
    monthly_volume_estimate: data.monthlyVolume,
    use_case_description: data.useCase,
    sample_message: data.sampleMessage,
    opt_in_description: data.optInDescription,
    opt_in_screenshot_url: data.optInScreenshotPath ?? null,
  }).eq("id", userId);

  const messagingProfileId = await ensureMessagingProfileForAccount(userId);

  const created: string[] = [];
  const errors: Array<{ cc: string; reason: string }> = [];
  let accountSenderSet = Boolean(acct.subaccount_phone_number || acct.subaccount_messaging_service_sid);

  async function setPrimarySender(patch: any) {
    if (accountSenderSet) return;
    await supabaseAdmin.from("accounts").update(patch).eq("id", userId);
    accountSenderSet = true;
  }

  for (const raw of data.targetCountries) {
    const cc = raw.toUpperCase();
    try {
      const kind = pickSenderKind(cc);
      const { data: existing } = await supabaseAdmin
        .from("sender_assets")
        .select("id,phone_number,phone_sid,messaging_service_sid,sender_kind,verification_status")
        .eq("account_id", userId).eq("country_code", cc).limit(1).maybeSingle();
      if (existing) {
        if (existing.verification_status === "verified" && existing.phone_number) {
          await setPrimarySender({
            subaccount_phone_number: existing.phone_number,
            subaccount_phone_sid: existing.phone_sid ?? null,
            subaccount_messaging_service_sid: existing.messaging_service_sid ?? messagingProfileId,
            onboarding_status: "active",
          });
        }
        created.push(`${cc}:exists`);
        continue;
      }

      if (kind === "sender_id") {
        const sid = senderIdFromName(acct.legal_business_name || "Sender", data.customSenderId);
        const { ALPHA_SENDER_REQUIRES_REGISTRATION } = await import("./telnyx.server");
        const needsReg = ALPHA_SENDER_REQUIRES_REGISTRATION.has(cc);
        await supabaseAdmin.from("sender_assets").insert({
          account_id: userId,
          country_code: cc,
          sender_kind: "sender_id",
          phone_number: sid,
          phone_sid: null,
          messaging_service_sid: messagingProfileId,
          telnyx_messaging_profile_id: messagingProfileId,
          verification_status: needsReg ? "requires_registration" : "verified",
        });
        if (!needsReg) {
          await setPrimarySender({
            subaccount_phone_number: sid,
            subaccount_messaging_service_sid: messagingProfileId,
            onboarding_status: "active",
          });
        }
        created.push(needsReg ? `${cc}:requires_registration` : `${cc}:sender_id`);
        continue;
      }

      // toll_free: search + buy on Telnyx, attach to messaging profile.
      const available = await safeTelnyxCall(
        "search_tollfree", { userId, messagingProfileId },
        () => searchAvailableNumbers({ country: cc, numberType: "toll-free", limit: 5 }),
      );
      const pick = available[0];
      if (!pick) {
        errors.push({ cc, reason: "No toll-free numbers are available right now." });
        continue;
      }
      const order = await safeTelnyxCall(
        "order_tollfree", { userId, messagingProfileId },
        () => orderNumber({ phoneNumber: pick.phone_number, messagingProfileId }),
      );
      const bought = order.phone_numbers?.[0];
      if (!bought) {
        errors.push({ cc, reason: "Telnyx accepted the order but did not return a phone number." });
        continue;
      }

      await supabaseAdmin.from("numbers").upsert({
        account_id: userId,
        phone_number: bought.phone_number,
        telnyx_number_id: bought.id,
        telnyx_messaging_profile_id: messagingProfileId,
        country_code: cc,
        number_type: "toll_free",
        status: "active",
      }, { onConflict: "phone_number" });

      await supabaseAdmin.from("sender_assets").insert({
        account_id: userId,
        country_code: cc,
        sender_kind: "toll_free",
        phone_number: bought.phone_number,
        phone_sid: bought.id,
        telnyx_phone_number_id: bought.id,
        telnyx_messaging_profile_id: messagingProfileId,
        messaging_service_sid: messagingProfileId,
        verification_status: "submitted", // requires TF verification via wizard
      });
      await setPrimarySender({
        subaccount_phone_number: bought.phone_number,
        subaccount_phone_sid: bought.id,
        subaccount_messaging_service_sid: messagingProfileId,
        onboarding_status: "sender_pending",
      });
      created.push(`${cc}:submitted`);
    } catch (e: any) {
      errors.push({ cc, reason: e?.message ?? "unknown error" });
    }
  }

  return { created, errors };
}

// Retained for compatibility with cron poller; Telnyx TF verification is
// handled separately by the wizard flow so this is now a no-op.
export async function syncToollfreeVerifications(_opts: { onlyAccountId?: string } = {}) {
  return { checked: 0, updated: 0 };
}
