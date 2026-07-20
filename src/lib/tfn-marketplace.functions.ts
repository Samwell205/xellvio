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
    buyerPriceUsd: toNum(map.tfn_buyer_price_usd, 50),
    commissionPct: toNum(map.tfn_commission_pct, 25),
    ngnPerUsd: toNum(map.tfn_ngn_per_usd, 1500),
  };
}

async function listAvailablePoolNumbers(): Promise<
  Array<{ phone_number: string; country_code: string; telnyx_phone_number_id: string | null; telnyx_messaging_profile_id: string }>
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pool } = await supabaseAdmin
    .from("shared_tollfree_pool")
    .select("phone_number,country_code,telnyx_phone_number_id,telnyx_messaging_profile_id");
  const rows = pool ?? [];
  if (rows.length === 0) return [];
  const phones = rows.map((r: any) => r.phone_number);
  const { data: attached } = await supabaseAdmin
    .from("sender_assets")
    .select("phone_number")
    .in("phone_number", phones);
  const taken = new Set((attached ?? []).map((r: any) => r.phone_number));
  return rows.filter((r: any) => !taken.has(r.phone_number)) as any;
}

async function countAvailable() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ count: verifierCount }, poolAvailable] = await Promise.all([
    supabaseAdmin
      .from("verifier_tfns")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified")
      .is("sold_to_account_id", null),
    listAvailablePoolNumbers(),
  ]);
  return (verifierCount ?? 0) + poolAvailable.length;
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

async function claimFromPool(userId: string, priceUsd: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const available = await listAvailablePoolNumbers();
  if (available.length === 0) return null;
  const pick = available[0];

  // Atomically remove from pool to prevent double-selling
  const { data: deleted, error: delErr } = await supabaseAdmin
    .from("shared_tollfree_pool")
    .delete()
    .eq("phone_number", pick.phone_number)
    .select("phone_number")
    .maybeSingle();
  if (delErr || !deleted) return null;

  const nowIso = new Date().toISOString();
  const { error: insErr } = await supabaseAdmin.from("sender_assets").upsert(
    {
      account_id: userId,
      country_code: (pick.country_code || "US").toUpperCase(),
      sender_kind: "toll_free" as const,
      phone_number: pick.phone_number,
      telnyx_phone_number_id: pick.telnyx_phone_number_id,
      telnyx_messaging_profile_id: pick.telnyx_messaging_profile_id,
      verification_status: "verified" as const,
      verified_at: nowIso,
      rejected_at: null,
      rejection_reason: null,
      friendly_rejection_reason: null,
      last_synced_at: nowIso,
      is_shared: false,
    },
    { onConflict: "account_id,country_code,sender_kind" },
  );
  if (insErr) {
    // Roll pool row back so the number isn't lost
    await supabaseAdmin.from("shared_tollfree_pool").insert({
      phone_number: pick.phone_number,
      country_code: pick.country_code,
      telnyx_phone_number_id: pick.telnyx_phone_number_id,
      telnyx_messaging_profile_id: pick.telnyx_messaging_profile_id,
    });
    throw new Error(insErr.message);
  }

  await supabaseAdmin.rpc("debit_account", {
    _account_id: userId,
    _amount: priceUsd,
    _campaign_id: undefined as any,
    _description: `Purchased verified toll-free number ${pick.phone_number}`,
  });

  // Clear tollfree setup fee since they got a pre-verified number
  await supabaseAdmin.from("accounts").update({
    tollfree_setup_fee_due_cents: 0,
    tollfree_setup_fee_paid_at: nowIso,
    onboarding_status: "active",
  }).eq("id", userId);

  return { phone_number: pick.phone_number, country: (pick.country_code || "US").toUpperCase() };
}

async function buyImpl(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buyerPriceUsd, commissionPct, ngnPerUsd } = await readSettings();

  const { data: acct } = await supabaseAdmin
    .from("accounts").select("credit_balance").eq("id", userId).maybeSingle();
  if (!acct || Number(acct.credit_balance) < buyerPriceUsd) {
    throw new Error(`Insufficient balance. This number costs $${buyerPriceUsd.toFixed(2)}`);
  }

  // Prefer platform-owned verified pool numbers (auto-synced from Telnyx)
  const pool = await claimFromPool(userId, buyerPriceUsd);
  if (pool) return { ok: true, ...pool };

  // Fall back to verifier marketplace numbers
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
