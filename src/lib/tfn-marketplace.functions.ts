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


async function countAvailable() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { countPurchasableTfns } = await import('./tfn-purchase.server');
  return countPurchasableTfns(supabaseAdmin);
}

export const getTfnMarketplaceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [actual, settings] = await Promise.all([countAvailable(), readSettings()]);
    const available = actual;
    return { available, priceUsd: settings.buyerPriceUsd };
  });

export const getTfnMarketplaceOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [actual, settings] = await Promise.all([countAvailable(), readSettings()]);
    const available_count = actual;
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
 * credit balance. Failed setup stays reserved for a safe retry; never auto-refund.
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
