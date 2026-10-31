import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function readSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", ["tfn_buyer_price_usd", "tfn_commission_pct", "tfn_ngn_per_usd", "tfn_advertised_available"]);
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  const toNum = (v: any, fb: number) => {
    const n = typeof v === "string" ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const advRaw = map.tfn_advertised_available;
  const advNum = advRaw == null ? null : Number(advRaw);
  return {
    buyerPriceUsd: toNum(map.tfn_buyer_price_usd, 50),
    commissionPct: toNum(map.tfn_commission_pct, 25),
    ngnPerUsd: toNum(map.tfn_ngn_per_usd, 1500),
    advertisedAvailable: Number.isFinite(advNum as number) ? (advNum as number) : null,
  };
}


async function listAvailablePoolNumbers(): Promise<
  Array<{ phone_number: string; country_code: string; telnyx_phone_number_id: string | null; telnyx_messaging_profile_id: string }>
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Only approved, exclusively unassigned numbers can be purchased.
  const { data: pool, error } = await (supabaseAdmin as any)
    .from('twilio_verified_inventory')
    .select('phone_number')
    .eq('verification_status', 'verified').eq('available', true).is('assigned_account_id', null);
  if (error) throw new Error(error.message);
  return (pool ?? []).map((n: any) => ({ ...n, country_code: 'US', telnyx_phone_number_id: null, telnyx_messaging_profile_id: '' }));
}

async function countAvailable() {
  return (await listAvailablePoolNumbers()).length;
}

export const getTfnMarketplaceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [actual, settings] = await Promise.all([countAvailable(), readSettings()]);
    const available = settings.advertisedAvailable != null ? settings.advertisedAvailable : actual;
    return { available, priceUsd: settings.buyerPriceUsd };
  });

export const getTfnMarketplaceOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [actual, settings] = await Promise.all([countAvailable(), readSettings()]);
    const available_count = settings.advertisedAvailable != null ? settings.advertisedAvailable : actual;
    return { available_count, price_usd: settings.buyerPriceUsd };
  });

async function claimFromPool(
  userId: string,
  priceUsd: number,
  opts: { skipDebit?: boolean } = {},
) {
  const { assignTwilioInventory } = await import('./twilio-inventory.server');
  return assignTwilioInventory(userId, undefined, opts.skipDebit ? 0 : priceUsd);
}

/**
 * Assign a pre-verified toll-free number to a user after they've paid a
 * straight fee (Paystack card / NOWPayments crypto). Does NOT touch the
 * credit balance. Returns null when no number is available so the caller
 * can flag the payment for refund.
 */
export async function assignTfnAfterPayment(userId: string): Promise<{ phone_number: string; country: string } | null> {
  const { buyerPriceUsd } = await readSettings();
  return claimFromPool(userId, buyerPriceUsd, { skipDebit: true });
}


async function buyImpl(userId: string) {
  const { buyerPriceUsd: purchasePrice } = await readSettings();
  const { assignTwilioInventory } = await import('./twilio-inventory.server');
  return { ok: true, ...await assignTwilioInventory(userId, undefined, purchasePrice) };
}

export const purchaseTfnFromMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveBillingAccount } = await import('./billing-account.server');
    return buyImpl((await resolveBillingAccount(context.userId)).accountId);
  });

export const buyVerifiedTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveBillingAccount } = await import('./billing-account.server');
    return buyImpl((await resolveBillingAccount(context.userId)).accountId);
  });
