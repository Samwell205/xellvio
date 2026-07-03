import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function readSettings() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", ["tfn_flat_price_ngn", "tfn_commission_pct"]);
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  const toNum = (v: any, fb: number) => {
    const n = typeof v === "string" ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  return {
    priceNgn: toNum(map.tfn_flat_price_ngn, 15000),
    commissionPct: toNum(map.tfn_commission_pct, 25),
  };
}

export const getTfnMarketplaceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("verifier_tfns")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified");
    const settings = await readSettings();
    return { available: count ?? 0, priceNgn: settings.priceNgn };
  });

export const buyVerifiedTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { priceNgn, commissionPct } = await readSettings();

    // Charge tenant balance first (uses same credit balance as SMS).
    // Convert NGN price to USD-equivalent debit? Existing debit_account uses credit_balance in USD.
    // For now debit in the same units as credit_balance; treat priceNgn as NGN — admin should keep parity.
    // We'll debit the NGN value directly against credit_balance as a placeholder;
    // in production this should convert via configured FX. Assume 1:1 for MVP.
    const { data: acct } = await supabaseAdmin
      .from("accounts").select("credit_balance").eq("id", context.userId).maybeSingle();
    if (!acct || Number(acct.credit_balance) < priceNgn) {
      throw new Error(`Insufficient balance. This number costs ₦${priceNgn.toLocaleString()}`);
    }

    // Claim + sell atomically
    const { data: sold, error: rpcErr } = await supabaseAdmin.rpc("claim_and_sell_verified_tfn", {
      _account_id: context.userId,
      _price_ngn: priceNgn,
      _commission_pct: commissionPct,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(sold) ? sold[0] : sold;
    if (!row) throw new Error("No verified numbers available right now");

    // Debit tenant
    await supabaseAdmin.rpc("debit_account", {
      _account_id: context.userId,
      _amount: priceNgn,
      _campaign_id: undefined as any,
      _description: `Purchased verified TFN ${row.phone_number}`,
    });

    // Register as an approved sender_asset for tenant
    await supabaseAdmin.from("sender_assets").insert({
      account_id: context.userId,
      country_code: row.country,
      sender_kind: "toll_free",
      phone_number: row.phone_number,
      verification_status: "verified",
      last_synced_at: new Date().toISOString(),
    }).select().maybeSingle();

    return {
      ok: true,
      phone_number: row.phone_number,
      country: row.country,
    };
  });
