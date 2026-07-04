// Wire a Telnyx toll-free number to a tenant so they can send SMS.
// Called by admin assign flows. On Telnyx the concept of "MessagingService"
// is a "Messaging Profile" — we ensure the tenant has one, then reassign the
// number's messaging_profile_id to that tenant's profile.

export async function wireAssignedTollfreeForTenant(opts: {
  accountId: string;
  phoneNumber: string;
  countryCode?: string;
}): Promise<{ telnyx_number_id: string | null; telnyx_messaging_profile_id: string | null }> {
  const country = (opts.countryCode ?? "US").toUpperCase();
  if (!process.env.TELNYX_API_KEY) throw new Error("TELNYX_API_KEY is not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureMessagingProfileForAccount, getPhoneNumberByE164, reassignNumberToProfile, safeTelnyxCall } =
    await import("./telnyx.server");

  const messagingProfileId = await ensureMessagingProfileForAccount(opts.accountId);

  let phoneId: string | null = null;
  try {
    const found = await getPhoneNumberByE164(opts.phoneNumber);
    phoneId = found?.id ?? null;
    if (phoneId) {
      await safeTelnyxCall(
        "reassign_number",
        { userId: opts.accountId, messagingProfileId },
        () => reassignNumberToProfile({ phoneNumberId: phoneId!, messagingProfileId }),
      );
    }
  } catch (e) {
    console.warn("[assign-tfn] Telnyx lookup/reassign failed", e);
  }

  const row = {
    account_id: opts.accountId,
    country_code: country,
    sender_kind: "toll_free",
    phone_number: opts.phoneNumber,
    telnyx_number_id: phoneId,
    telnyx_phone_number_id: phoneId,
    telnyx_messaging_profile_id: messagingProfileId,
    telnyx_messaging_profile_id: messagingProfileId, // legacy column reused
    verification_status: "verified",
    last_synced_at: new Date().toISOString(),
  } as const;

  const { error: upsertErr } = await supabaseAdmin
    .from("sender_assets")
    .upsert(row, { onConflict: "account_id,country_code,sender_kind" });
  if (upsertErr) {
    console.error("[assign-tfn] upsert sender_assets failed", upsertErr);
    throw upsertErr;
  }

  await supabaseAdmin.from("numbers").upsert({
    account_id: opts.accountId,
    phone_number: opts.phoneNumber,
    telnyx_number_id: phoneId,
    telnyx_messaging_profile_id: messagingProfileId,
    country_code: country,
    number_type: "toll_free",
    status: "active",
  }, { onConflict: "phone_number" });

  await supabaseAdmin.from("accounts").update({
    telnyx_phone_number: opts.phoneNumber,
    telnyx_number_id: phoneId,
    telnyx_messaging_profile_id: messagingProfileId,
    onboarding_status: "active",
  }).eq("id", opts.accountId);

  return { telnyx_number_id: phoneId, telnyx_messaging_profile_id: messagingProfileId };
}

export async function unwireAssignedTollfreeForTenant(opts: { phoneNumber: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: asset } = await supabaseAdmin
    .from("sender_assets").select("id,account_id").eq("phone_number", opts.phoneNumber).maybeSingle();
  if (!asset) return;
  await supabaseAdmin.from("sender_assets").delete().eq("id", asset.id);
  await supabaseAdmin.from("numbers").delete().eq("phone_number", opts.phoneNumber);
  await supabaseAdmin.from("accounts").update({
    telnyx_phone_number: null,
    telnyx_number_id: null,
    telnyx_messaging_profile_id: null,
  }).eq("id", asset.account_id).eq("telnyx_phone_number", opts.phoneNumber);
}
