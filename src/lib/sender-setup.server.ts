// Tenant SMS setup: provisions a Messaging Profile + per-country sender for
// each target country. For US/CA we buy a Telnyx toll-free number and mark it
// pending TF verification (which the tenant completes via the dedicated
// toll-free wizard). For everywhere else we register an alphanumeric sender
// ID; Telnyx routes it via the tenant's Messaging Profile.

import type { SetupSmsPayload } from "./sender-setup.schema";

function pickSenderKind(country: string): "toll_free" | "sender_id" {
  const cc = country.toUpperCase();
  return cc === "US" || cc === "CA" || cc === "PR" ? "toll_free" : "sender_id";
}

function senderIdFromName(name: string, requested?: string): string {
  const cleaned = (requested || name || "Sender")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 11);
  if (/[A-Z]/.test(cleaned) && cleaned.length >= 1) return cleaned;
  return "SENDER";
}

export async function setupSmsForUser(userId: string, data: SetupSmsPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureMessagingProfileForAccount, searchAvailableNumbers, orderNumber, safeTelnyxCall, createAlphanumericSenderId } =
    await import("./telnyx.server");

  let { data: acct, error } = await supabaseAdmin
    .from("accounts")
    .select("id,legal_business_name,business_address,business_reg_number,website_url,privacy_policy_url,terms_url,contact_email,full_name,phone,onboarding_status,telnyx_phone_number,telnyx_messaging_profile_id")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!acct) {
    const { error: createAccountError } = await supabaseAdmin
      .from("accounts")
      .insert({ id: userId, onboarding_status: "signup" });
    if (createAccountError) throw createAccountError;
    const { data: createdAcct, error: reloadError } = await supabaseAdmin
      .from("accounts")
      .select("id,legal_business_name,business_address,business_reg_number,website_url,privacy_policy_url,terms_url,contact_email,full_name,phone,onboarding_status,telnyx_phone_number,telnyx_messaging_profile_id")
      .eq("id", userId).maybeSingle();
    if (reloadError || !createdAcct) throw new Error("Could not create your account record. Please refresh and try again.");
    acct = createdAcct;
  }
  if (acct.onboarding_status === "suspended") throw new Error("Account suspended");
  const targetsUsOrCanada = data.targetCountries.some((raw) => {
    const cc = raw.toUpperCase();
    return cc === "US" || cc === "CA";
  });
  if (targetsUsOrCanada && (
    !acct.legal_business_name ||
    !acct.business_address ||
    !acct.business_reg_number ||
    !acct.website_url ||
    !acct.privacy_policy_url ||
    !acct.terms_url ||
    !acct.contact_email ||
    !acct.phone
  )) {
    throw new Error("Please complete your carrier details first (legal name, address, registration number, website, Privacy Policy, Terms, contact email, and business phone).");
  }

  await supabaseAdmin.from("accounts").update({
    sms_target_countries: data.targetCountries,
    monthly_volume_estimate: data.monthlyVolume,
    use_case_description: data.useCase ?? null,
    sample_message: data.sampleMessage ?? null,
    opt_in_description: data.optInDescription ?? null,
    opt_in_screenshot_url: data.optInScreenshotPath ?? null,
  }).eq("id", userId);

  const messagingProfileId = await ensureMessagingProfileForAccount(userId);

  const created: string[] = [];
  const errors: Array<{ cc: string; reason: string }> = [];
  let accountSenderSet = Boolean(acct.telnyx_phone_number || acct.telnyx_messaging_profile_id);

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
        .select("id,phone_number,telnyx_phone_number_id,telnyx_messaging_profile_id,sender_kind,verification_status")
        .eq("account_id", userId).eq("country_code", cc).limit(1).maybeSingle();
      if (existing) {
        const { ALPHA_SENDER_REQUIRES_REGISTRATION } = await import("./telnyx.server");
        const { ALPHA_SENDER_UNSUPPORTED_SET } = await import("./countries");
        const supportedAlphaReady =
          existing.sender_kind === "sender_id" &&
          !ALPHA_SENDER_UNSUPPORTED_SET.has(cc) &&
          !ALPHA_SENDER_REQUIRES_REGISTRATION.has(cc);
        if (supportedAlphaReady && existing.verification_status !== "verified") {
          await supabaseAdmin.from("sender_assets").update({
            verification_status: "verified",
            rejection_reason: null,
            last_synced_at: new Date().toISOString(),
          }).eq("id", existing.id);
          await setPrimarySender({
            telnyx_phone_number: existing.phone_number,
            telnyx_messaging_profile_id: existing.telnyx_messaging_profile_id ?? messagingProfileId,
            onboarding_status: "active",
          });
        }
        if (existing.verification_status === "verified" && existing.phone_number) {
          await setPrimarySender({
            telnyx_phone_number: existing.phone_number,
            telnyx_number_id: existing.telnyx_phone_number_id ?? null,
            telnyx_messaging_profile_id: existing.telnyx_messaging_profile_id ?? messagingProfileId,
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
        let status: "verified" | "submitted" | "requires_registration" = needsReg ? "submitted" : "verified";
        let alphaSenderId: string | null = null;
        let telnyxError: string | null = null;
        try {
          const alpha = await safeTelnyxCall(
            "create_alpha_sender", { userId, messagingProfileId },
            () => createAlphanumericSenderId({ messagingProfileId, senderId: sid, isoCountryCode: cc }),
          );
          alphaSenderId = alpha.id ?? null;
        } catch (e: any) {
          telnyxError = String(e?.message ?? e);
          const telnyxErrorText = telnyxError.toLowerCase();
          const alreadyExists = telnyxErrorText.includes("already") || telnyxErrorText.includes("duplicate");
          status = needsReg ? (alreadyExists ? "submitted" : "requires_registration") : "verified";
        }
        await supabaseAdmin.from("sender_assets").insert({
          account_id: userId,
          country_code: cc,
          sender_kind: "sender_id",
          phone_number: sid,
          telnyx_phone_number_id: null,
          telnyx_messaging_profile_id: messagingProfileId,
          telnyx_verification_id: alphaSenderId,
          verification_status: status,
          rejection_reason: telnyxError,
          submitted_at: status === "submitted" || status === "requires_registration" ? new Date().toISOString() : null,
        });
        if (status === "verified") {
          await setPrimarySender({
            telnyx_phone_number: sid,
            telnyx_messaging_profile_id: messagingProfileId,
            onboarding_status: "active",
          });
        }
        created.push(status === "verified" ? `${cc}:sender_id` : `${cc}:${status}`);
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
        telnyx_phone_number_id: bought.id,
        telnyx_messaging_profile_id: messagingProfileId,
        verification_status: "submitted", // requires TF verification via wizard
      });
      await setPrimarySender({
        telnyx_phone_number: bought.phone_number,
        telnyx_number_id: bought.id,
        telnyx_messaging_profile_id: messagingProfileId,
        onboarding_status: "sender_pending",
      });
      created.push(`${cc}:submitted`);
    } catch (e: any) {
      errors.push({ cc, reason: e?.message ?? "unknown error" });
    }
  }

  return { created, errors };
}

// Poll Telnyx for every toll-free asset that's still awaiting a decision, and
// update our row so tenants see submitted → in_review → verified without any
// manual refresh. Called every 10 minutes by pg_cron via
// /api/public/poll-verifications.
export async function syncToollfreeVerifications(_opts: { onlyAccountId?: string } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchTwilioTollfreeVerification } = await import("./tollfree-submit.server");

  let q = supabaseAdmin
    .from("sender_assets")
    .select("id, account_id, telnyx_verification_id, verification_status")
    .eq("sender_kind", "toll_free")
    .not("telnyx_verification_id", "is", null)
    .in("verification_status", ["submitted", "in_review", "pending"]);
  if (_opts.onlyAccountId) q = q.eq("account_id", _opts.onlyAccountId);
  const { data: rows, error } = await q;
  if (error) return { checked: 0, updated: 0, error: error.message };

  let updated = 0;
  const errors: Array<{ id: string; reason: string }> = [];
  for (const row of rows ?? []) {
    if (!row.telnyx_verification_id) continue;
    try {
      const res = await fetchTwilioTollfreeVerification({
        verificationSid: row.telnyx_verification_id, accountSid: "", authToken: "",
      });
      const next = res.status === "verified" ? "verified" : res.status;
      if (next !== row.verification_status || res.rejectionReason) {
        await supabaseAdmin.from("sender_assets").update({
          verification_status: next,
          rejection_reason: res.rejectionReason,
          last_synced_at: new Date().toISOString(),
        }).eq("id", row.id);
        updated++;
      } else {
        await supabaseAdmin.from("sender_assets").update({
          last_synced_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    } catch (e: any) {
      errors.push({ id: row.id, reason: e?.message ?? "unknown" });
    }
  }

  return { checked: rows?.length ?? 0, updated, errors };
}
