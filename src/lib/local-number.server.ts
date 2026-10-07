/**
 * Local (10DLC) number sales. Numbers live on the carrier account and sit on
 * the 10DLC-linked messaging profile; a tenant gets a verified `local`
 * sender_asset pointing at one. Charging happens from credit balance only
 * after a number is actually attached, so a failed assignment never takes money.
 */
export const DEFAULT_LOCAL_PRICE_USD = 100;

/** A usable US area code: 3 digits, first digit 2-9, and not an N11 service code. */
export const AREA_CODE_PATTERN = /^(?![2-9]11$)[2-9]\d{2}$/;

export function isValidAreaCode(value: string): boolean {
  return AREA_CODE_PATTERN.test(value.trim());
}

export async function readLocalPrice(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings").select("value").eq("key", "local_buyer_price_usd").maybeSingle();
  const n = Number((data as any)?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOCAL_PRICE_USD;
}

/** Linked local numbers (on a messaging profile) with their tenant counts. */
export async function listSellableLocalNumbers() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { listAccountLocalNumbers } = await import("@/lib/telnyx.server");
  const nums = (await listAccountLocalNumbers()).filter((n) => n.messaging_profile_id);
  if (!nums.length) return [];
  const { data: att } = await supabaseAdmin
    .from("sender_assets").select("phone_number").eq("sender_kind", "local")
    .in("phone_number", nums.map((n) => n.phone_number));
  const counts = new Map<string, number>();
  for (const a of att ?? []) counts.set(a.phone_number as string, (counts.get(a.phone_number as string) ?? 0) + 1);
  return nums
    .map((n) => ({ ...n, tenants: counts.get(n.phone_number) ?? 0 }))
    .sort((a, b) => a.tenants - b.tenants);
}

export async function getBalance(accountId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("accounts").select("credit_balance").eq("id", accountId).maybeSingle();
  return Number(data?.credit_balance ?? 0);
}

export async function tenantLocalNumber(accountId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sender_assets").select("phone_number").eq("account_id", accountId)
    .eq("sender_kind", "local").eq("country_code", "US").maybeSingle();
  return (data?.phone_number as string) ?? null;
}

/** Attach a carrier local number to a tenant as a verified sender. */
export async function attachLocalNumber(accountId: string, phone: string, country = "US") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getPhoneNumberByE164 } = await import("@/lib/telnyx.server");
  const found = await getPhoneNumberByE164(phone);
  if (!found) throw new Error("This number is not on your carrier account.");
  const profileId = found.messaging_profile_id;
  if (!profileId) {
    throw new Error("Assign this number to a Messaging Profile (the one linked to your 10DLC campaign) first, then attach a tenant.");
  }
  const cc = country.toUpperCase();
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("sender_assets").select("id,phone_number")
    .eq("account_id", accountId).eq("country_code", cc).eq("sender_kind", "local").maybeSingle();
  if (existing?.phone_number && existing.phone_number !== phone) {
    throw new Error(`Tenant already has a different local number (${existing.phone_number}) for ${cc}. Detach it first.`);
  }
  const { error } = await supabaseAdmin.from("sender_assets").upsert({
    account_id: accountId, country_code: cc, sender_kind: "local", phone_number: phone,
    telnyx_phone_number_id: found.id, telnyx_messaging_profile_id: profileId,
    verification_status: "verified", verified_at: nowIso, rejected_at: null, rejection_reason: null,
    friendly_rejection_reason: null, last_synced_at: nowIso, is_shared: true,
  }, { onConflict: "account_id,country_code,sender_kind" });
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("numbers").upsert({
    account_id: accountId, phone_number: phone, telnyx_number_id: found.id,
    telnyx_messaging_profile_id: profileId, country_code: cc, number_type: "personal", status: "active",
  }, { onConflict: "phone_number" });
  const { data: acct } = await supabaseAdmin
    .from("accounts").select("telnyx_phone_number").eq("id", accountId).maybeSingle();
  if (!acct?.telnyx_phone_number) {
    await supabaseAdmin.from("accounts").update({
      telnyx_phone_number: phone, telnyx_number_id: found.id, telnyx_messaging_profile_id: profileId,
    }).eq("id", accountId);
  }
  await supabaseAdmin.from("accounts").update({ onboarding_status: "active" }).eq("id", accountId);
}

export async function chargeLocal(accountId: string, phone: string, price: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("debit_account", {
    _account_id: accountId, _amount: price, _campaign_id: null as any,
    _description: `Purchased verified local number ${phone}`,
  });
  if (error) throw new Error(error.message);
}

export async function notifyAdmins(title: string, body: string) {
  try {
    const [{ sendAdminSms }, { sendAdminPush }] = await Promise.all([
      import("./admin-notify.server"), import("./admin-push.server"),
    ]);
    await Promise.all([
      sendAdminSms(`Xellvio: ${body}`),
      sendAdminPush({ title, body, url: "/admin/number-requests", tag: `local-${Date.now()}` }),
    ]);
  } catch (e) {
    console.error("[local-number] admin notify failed", e);
  }
}
