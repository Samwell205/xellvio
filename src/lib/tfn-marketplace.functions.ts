import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function readSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", ["tfn_buyer_price_usd", "tfn_commission_pct", "tfn_ngn_per_usd"]);
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  const toNum = (v: any, fb: number) => {
    const n = typeof v === "string" ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  return {
    buyerPriceUsd: toNum(map.tfn_buyer_price_usd, 15),
    commissionPct: toNum(map.tfn_commission_pct, 25),
    ngnPerUsd: toNum(map.tfn_ngn_per_usd, 1500),
  };
}

async function countAvailable() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("verifier_tfns")
    .select("id", { count: "exact", head: true })
    .eq("status", "verified")
    .is("sold_to_account_id", null);
  return count ?? 0;
}

export const getTfnMarketplaceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [available, settings] = await Promise.all([countAvailable(), readSettings()]);
    return { available, priceUsd: settings.buyerPriceUsd };
  });

export const getTfnMarketplaceOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [available_count, settings] = await Promise.all([countAvailable(), readSettings()]);
    return { available_count, price_usd: settings.buyerPriceUsd };
  });

async function buyImpl(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buyerPriceUsd, commissionPct, ngnPerUsd } = await readSettings();

  const { data: acct } = await supabaseAdmin
    .from("accounts").select("credit_balance").eq("id", userId).maybeSingle();
  if (!acct || Number(acct.credit_balance) < buyerPriceUsd) {
    throw new Error(`Insufficient balance. This number costs $${buyerPriceUsd.toFixed(2)}`);
  }

  // Atomically claim any verified & unassigned number and mark as sold
  const priceNgn = buyerPriceUsd * ngnPerUsd;
  const { data: sold, error: rpcErr } = await supabaseAdmin.rpc("claim_and_sell_verified_tfn", {
    _account_id: userId,
    _price_ngn: priceNgn,
    _commission_pct: commissionPct,
  });
  if (rpcErr) throw new Error(rpcErr.message);
  const row = Array.isArray(sold) ? sold[0] : sold;
  if (!row) throw new Error("No verified numbers available right now");

  await supabaseAdmin.rpc("debit_account", {
    _account_id: userId,
    _amount: buyerPriceUsd,
    _campaign_id: undefined as any,
    _description: `Purchased verified TFN ${row.phone_number}`,
  });

  await supabaseAdmin.from("sender_assets").insert({
    account_id: userId,
    country_code: row.country,
    sender_kind: "toll_free",
    phone_number: row.phone_number,
    verification_status: "verified",
    last_synced_at: new Date().toISOString(),
  });

  return { ok: true, phone_number: row.phone_number, country: row.country };
}

export const purchaseTfnFromMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: any) => buyImpl(context.userId));

export const buyVerifiedTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => buyImpl(context.userId));
