// Wire a Telnyx toll-free number to a tenant so they can send SMS.
// Called by admin assign flows. On Telnyx the concept of "MessagingService"
// is a "Messaging Profile" — we ensure the tenant has one, then reassign the
// number's messaging_profile_id to that tenant's profile.

export async function wireAssignedTollfreeForTenant(opts: {
  accountId: string;
  phoneNumber: string;
  countryCode?: string;
  markVerified?: boolean;
}): Promise<{ telnyx_phone_number_id: string | null; telnyx_messaging_profile_id: string | null }> {
  const country = (opts.countryCode ?? "US").toUpperCase();
  const markVerified = opts.markVerified === true;
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

  const nowIso = new Date().toISOString();
  const row = {
    account_id: opts.accountId,
    country_code: country,
    sender_kind: "toll_free",
    phone_number: opts.phoneNumber,
    telnyx_phone_number_id: phoneId,
    telnyx_messaging_profile_id: messagingProfileId,
    // Provisioning the number does NOT mean the carrier approved toll-free
    // verification unless an admin explicitly grants verified access.
    verification_status: markVerified ? "verified" : "pending",
    last_synced_at: nowIso,
    ...(markVerified
      ? { verified_at: nowIso, rejected_at: null, rejection_reason: null, friendly_rejection_reason: null }
      : {}),
  } as const;

  // North American toll-free numbers reach US, Canada, and Puerto Rico from
  // the same number. Mirror the sender_asset row across all three so
  // campaigns targeting any of those countries pick the same number.
  const naSet = new Set(["US", "CA", "PR"]);
  const countriesToUpsert = naSet.has(country) ? ["US", "CA", "PR"] : [country];
  for (const cc of countriesToUpsert) {
    const { error: upsertErr } = await supabaseAdmin
      .from("sender_assets")
      .upsert({ ...row, country_code: cc }, { onConflict: "account_id,country_code,sender_kind" });
    if (upsertErr) {
      console.error("[assign-tfn] upsert sender_assets failed", upsertErr);
      throw upsertErr;
    }
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
    ...(markVerified
      ? { tollfree_setup_fee_due_cents: 0, tollfree_setup_fee_paid_at: nowIso }
      : {}),
  }).eq("id", opts.accountId);

  return { telnyx_phone_number_id: phoneId, telnyx_messaging_profile_id: messagingProfileId };
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
