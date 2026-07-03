import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export const adminListVerifiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifiers } = await supabaseAdmin
      .from("verifiers")
      .select("id,user_id,full_name,email,is_active,created_at")
      .order("created_at", { ascending: false });
    const ids = (verifiers ?? []).map(v => v.id);
    const [{ data: banks }, { data: wallets }] = await Promise.all([
      supabaseAdmin.from("verifier_bank_accounts")
        .select("verifier_id,bank_name,account_number,account_name")
        .in("verifier_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("verifier_wallets")
        .select("verifier_id,balance_ngn,lifetime_earned_ngn")
        .in("verifier_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const bMap = Object.fromEntries((banks ?? []).map(b => [b.verifier_id, b]));
    const wMap = Object.fromEntries((wallets ?? []).map(w => [w.verifier_id, w]));
    return (verifiers ?? []).map(v => ({
      ...v,
      bank: bMap[v.id] ?? null,
      wallet: wMap[v.id] ?? null,
    }));
  });

export const adminListTfns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ status: z.enum(["pending_verification","verified","sold","rejected","all"]).default("all") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("verifier_tfns")
      .select("id,phone_number,country,status,verifier_id,rejection_reason,sold_to_account_id,sold_at,payout_ngn,commission_ngn,notes,created_at,verifiers(full_name,email)")
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const adminUpdateTfnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      tfn_id: z.string().uuid(),
      status: z.enum(["verified","rejected","pending_verification"]),
      rejection_reason: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("verifier_tfns")
      .update({
        status: data.status,
        rejection_reason: data.status === "rejected" ? (data.rejection_reason ?? null) : null,
      })
      .eq("tfn_id" as any, data.tfn_id)  // keep as .eq below
      ;
    // safer: use id directly
    if (error) {
      const { error: e2 } = await supabaseAdmin
        .from("verifier_tfns")
        .update({
          status: data.status,
          rejection_reason: data.status === "rejected" ? (data.rejection_reason ?? null) : null,
        })
        .eq("id", data.tfn_id);
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });

export const adminAssignTfnToAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tfn_id: z.string().uuid(), account_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Read settings for pricing
    const { data: settingsRows } = await supabaseAdmin
      .from("platform_settings").select("key,value")
      .in("key", ["tfn_flat_price_ngn","tfn_commission_pct"]);
    const map = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, Number(r.value)]));
    const price = Number.isFinite(map.tfn_flat_price_ngn) ? map.tfn_flat_price_ngn : 15000;
    const commission = Number.isFinite(map.tfn_commission_pct) ? map.tfn_commission_pct : 25;

    const { data: tfn } = await supabaseAdmin
      .from("verifier_tfns").select("verifier_id,phone_number,country,status")
      .eq("id", data.tfn_id).maybeSingle();
    if (!tfn) throw new Error("TFN not found");
    if (tfn.status !== "verified") throw new Error("Only verified numbers can be assigned");

    const commissionAmt = Math.round(price * commission) / 100;
    const payoutAmt = price - commissionAmt;

    // Mark sold
    const { error: uErr } = await supabaseAdmin.from("verifier_tfns").update({
      status: "sold",
      sold_to_account_id: data.account_id,
      sold_at: new Date().toISOString(),
      sale_price_ngn: price,
      commission_ngn: commissionAmt,
      payout_ngn: payoutAmt,
    }).eq("id", data.tfn_id);
    if (uErr) throw new Error(uErr.message);

    // Credit wallet
    await supabaseAdmin.rpc("ensure_verifier_wallet", { _verifier_id: tfn.verifier_id });
    const { data: walletRow } = await supabaseAdmin.from("verifier_wallets")
      .select("balance_ngn").eq("verifier_id", tfn.verifier_id).maybeSingle();
    const newBalance = Number(walletRow?.balance_ngn ?? 0) + payoutAmt;
    await supabaseAdmin.from("verifier_wallets").update({
      balance_ngn: newBalance,
      lifetime_earned_ngn: newBalance,
    }).eq("verifier_id", tfn.verifier_id);
    await supabaseAdmin.from("verifier_transactions").insert({
      verifier_id: tfn.verifier_id,
      type: "sale_credit",
      amount_ngn: payoutAmt,
      balance_after: newBalance,
      tfn_id: data.tfn_id,
      description: `Admin-assigned sale of ${tfn.phone_number}`,
    });

    // Register as tenant sender asset
    await supabaseAdmin.from("sender_assets").insert({
      account_id: data.account_id,
      country_code: tfn.country,
      sender_kind: "toll_free",
      phone_number: tfn.phone_number,
      verification_status: "verified",
      last_synced_at: new Date().toISOString(),
    });

    return { ok: true };
  });

export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("verifier_withdrawals")
      .select("id,verifier_id,amount_ngn,status,admin_note,requested_at,paid_at,verifiers(full_name,email),verifier_bank_accounts:verifier_id(bank_name,account_number,account_name)")
      .order("requested_at", { ascending: false });
    // fetch bank separately (foreign relation ambiguous)
    const rows = data ?? [];
    const vids = rows.map((r: any) => r.verifier_id);
    const { data: banks } = await supabaseAdmin
      .from("verifier_bank_accounts")
      .select("verifier_id,bank_name,account_number,account_name")
      .in("verifier_id", vids.length ? vids : ["00000000-0000-0000-0000-000000000000"]);
    const bMap = Object.fromEntries((banks ?? []).map(b => [b.verifier_id, b]));
    return rows.map((r: any) => ({ ...r, bank: bMap[r.verifier_id] ?? null }));
  });

export const adminMarkWithdrawalPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ withdrawal_id: z.string().uuid(), admin_note: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("mark_verifier_withdrawal_paid", {
      _withdrawal_id: data.withdrawal_id,
      _admin_note: data.admin_note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRejectWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ withdrawal_id: z.string().uuid(), admin_note: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reject_verifier_withdrawal", {
      _withdrawal_id: data.withdrawal_id,
      _admin_note: data.admin_note,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetTfnSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_settings").select("key,value")
      .in("key", ["tfn_flat_price_ngn","tfn_commission_pct"]);
    const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, Number(r.value)]));
    return {
      price_ngn: Number.isFinite(map.tfn_flat_price_ngn) ? map.tfn_flat_price_ngn : 15000,
      commission_pct: Number.isFinite(map.tfn_commission_pct) ? map.tfn_commission_pct : 25,
    };
  });

export const adminSetTfnSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      price_ngn: z.number().nonnegative().max(1_000_000),
      commission_pct: z.number().min(0).max(90),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("platform_settings").upsert([
      { key: "tfn_flat_price_ngn", value: data.price_ngn as any },
      { key: "tfn_commission_pct", value: data.commission_pct as any },
    ], { onConflict: "key" });
    return { ok: true };
  });

export const adminListAccountsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("accounts").select("id,email,full_name").order("email").limit(500);
    return data ?? [];
  });
