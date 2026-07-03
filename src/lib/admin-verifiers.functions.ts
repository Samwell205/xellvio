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
    const idFilter = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: banks }, { data: wallets }, { data: tfns }] = await Promise.all([
      supabaseAdmin.from("verifier_bank_accounts")
        .select("verifier_id,bank_name,account_number,account_name")
        .in("verifier_id", idFilter),
      supabaseAdmin.from("verifier_wallets")
        .select("verifier_id,balance_ngn,lifetime_earned_ngn")
        .in("verifier_id", idFilter),
      supabaseAdmin.from("verifier_tfns")
        .select("verifier_id,status")
        .in("verifier_id", idFilter),
    ]);
    const bMap = Object.fromEntries((banks ?? []).map(b => [b.verifier_id, b]));
    const wMap = Object.fromEntries((wallets ?? []).map(w => [w.verifier_id, w]));
    const statsMap: Record<string, { total: number; pending: number; verified: number; rejected: number; sold: number }> = {};
    for (const t of tfns ?? []) {
      const k = t.verifier_id as string;
      const s = statsMap[k] ?? (statsMap[k] = { total: 0, pending: 0, verified: 0, rejected: 0, sold: 0 });
      s.total++;
      if (t.status === "pending_verification") s.pending++;
      else if (t.status === "verified") s.verified++;
      else if (t.status === "rejected") s.rejected++;
      else if (t.status === "sold") s.sold++;
    }
    return (verifiers ?? []).map(v => ({
      ...v,
      bank: bMap[v.id] ?? null,
      wallet: wMap[v.id] ?? null,
      stats: statsMap[v.id] ?? { total: 0, pending: 0, verified: 0, rejected: 0, sold: 0 },
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
    // Read settings for pricing (USD buyer price + NGN conversion for verifier payout)
    const { data: settingsRows } = await supabaseAdmin
      .from("platform_settings").select("key,value")
      .in("key", ["tfn_buyer_price_usd", "tfn_commission_pct", "tfn_ngn_per_usd"]);
    const map = Object.fromEntries((settingsRows ?? []).map((r: any) => [r.key, Number(r.value)]));
    const priceUsd = Number.isFinite(map.tfn_buyer_price_usd) ? map.tfn_buyer_price_usd : 15;
    const commission = Number.isFinite(map.tfn_commission_pct) ? map.tfn_commission_pct : 25;
    const ngnPerUsd = Number.isFinite(map.tfn_ngn_per_usd) ? map.tfn_ngn_per_usd : 1500;
    const priceNgn = priceUsd * ngnPerUsd;

    const { data: tfn } = await supabaseAdmin
      .from("verifier_tfns").select("verifier_id,phone_number,country,status,sold_to_account_id")
      .eq("id", data.tfn_id).maybeSingle();
    if (!tfn) throw new Error("TFN not found");
    if (tfn.status !== "verified" || tfn.sold_to_account_id) {
      throw new Error("Only verified & unassigned numbers can be assigned");
    }

    const commissionNgn = Math.round(priceNgn * commission) / 100;
    const payoutNgn = priceNgn - commissionNgn;

    // Mark sold
    const { error: uErr } = await supabaseAdmin.from("verifier_tfns").update({
      status: "sold",
      sold_to_account_id: data.account_id,
      sold_at: new Date().toISOString(),
      sale_price_ngn: priceNgn,
      commission_ngn: commissionNgn,
      payout_ngn: payoutNgn,
    }).eq("id", data.tfn_id);
    if (uErr) throw new Error(uErr.message);

    // Credit verifier wallet
    await supabaseAdmin.rpc("ensure_verifier_wallet", { _verifier_id: tfn.verifier_id });
    const { data: walletRow } = await supabaseAdmin.from("verifier_wallets")
      .select("balance_ngn,lifetime_earned_ngn").eq("verifier_id", tfn.verifier_id).maybeSingle();
    const newBalance = Number(walletRow?.balance_ngn ?? 0) + payoutNgn;
    const newLifetime = Number(walletRow?.lifetime_earned_ngn ?? 0) + payoutNgn;
    await supabaseAdmin.from("verifier_wallets").update({
      balance_ngn: newBalance,
      lifetime_earned_ngn: newLifetime,
    }).eq("verifier_id", tfn.verifier_id);
    await supabaseAdmin.from("verifier_transactions").insert({
      verifier_id: tfn.verifier_id,
      type: "sale_credit",
      amount_ngn: payoutNgn,
      balance_after: newBalance,
      tfn_id: data.tfn_id,
      description: `Admin-assigned sale of ${tfn.phone_number}`,
    });

    // Register as tenant sender asset + provision MessagingService so tenant can send.
    const { wireAssignedTollfreeForTenant } = await import("./assign-tfn-to-tenant.server");
    await wireAssignedTollfreeForTenant({
      accountId: data.account_id,
      phoneNumber: tfn.phone_number,
      countryCode: tfn.country,
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
      .in("key", ["tfn_buyer_price_usd", "tfn_commission_pct", "tfn_ngn_per_usd"]);
    const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, Number(r.value)]));
    return {
      price_usd: Number.isFinite(map.tfn_buyer_price_usd) ? map.tfn_buyer_price_usd : 15,
      commission_pct: Number.isFinite(map.tfn_commission_pct) ? map.tfn_commission_pct : 25,
      ngn_per_usd: Number.isFinite(map.tfn_ngn_per_usd) ? map.tfn_ngn_per_usd : 1500,
    };
  });

export const adminSetTfnSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      price_usd: z.number().nonnegative().max(10_000),
      commission_pct: z.number().min(0).max(90),
      ngn_per_usd: z.number().positive().max(100_000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("platform_settings").upsert([
      { key: "tfn_buyer_price_usd", value: data.price_usd as any },
      { key: "tfn_commission_pct", value: data.commission_pct as any },
      { key: "tfn_ngn_per_usd", value: data.ngn_per_usd as any },
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

// ---- New admin controls ----

export const adminSetVerifierActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ verifier_id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("verifiers")
      .update({ is_active: data.is_active })
      .eq("id", data.verifier_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAdjustVerifierWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      verifier_id: z.string().uuid(),
      delta_ngn: z.number().refine((n) => Number.isFinite(n) && n !== 0, "Amount required"),
      reason: z.string().min(3).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("ensure_verifier_wallet", { _verifier_id: data.verifier_id });
    const { data: wallet } = await supabaseAdmin
      .from("verifier_wallets")
      .select("balance_ngn,lifetime_earned_ngn")
      .eq("verifier_id", data.verifier_id).maybeSingle();
    const newBalance = Math.max(0, Number(wallet?.balance_ngn ?? 0) + data.delta_ngn);
    const lifetime = Number(wallet?.lifetime_earned_ngn ?? 0) + (data.delta_ngn > 0 ? data.delta_ngn : 0);
    const { error: uErr } = await supabaseAdmin
      .from("verifier_wallets")
      .update({ balance_ngn: newBalance, lifetime_earned_ngn: lifetime })
      .eq("verifier_id", data.verifier_id);
    if (uErr) throw new Error(uErr.message);
    await supabaseAdmin.from("verifier_transactions").insert({
      verifier_id: data.verifier_id,
      type: "adjustment",
      amount_ngn: data.delta_ngn,
      balance_after: newBalance,
      description: `Admin ${data.delta_ngn > 0 ? "credit" : "debit"}: ${data.reason}`,
    });
    return { ok: true, balance_ngn: newBalance };
  });

export const adminDeleteVerifierTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tfn_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tfn } = await supabaseAdmin
      .from("verifier_tfns").select("status").eq("id", data.tfn_id).maybeSingle();
    if (!tfn) throw new Error("Number not found");
    if (tfn.status === "sold") throw new Error("Cannot delete a sold number");
    const { error } = await supabaseAdmin.from("verifier_tfns").delete().eq("id", data.tfn_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// List sold TFNs with buyer + verifier info for payout auditing
export const adminListSoldTfns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sold } = await supabaseAdmin
      .from("verifier_tfns")
      .select("id,phone_number,country,verifier_id,sold_to_account_id,sold_at,sale_price_ngn,payout_ngn,commission_ngn,verifiers(full_name,email)")
      .eq("status", "sold")
      .order("sold_at", { ascending: false })
      .limit(500);
    const buyerIds = Array.from(new Set((sold ?? []).map((s: any) => s.sold_to_account_id).filter(Boolean)));
    const { data: buyers } = await supabaseAdmin
      .from("accounts").select("id,email,full_name")
      .in("id", buyerIds.length ? buyerIds : ["00000000-0000-0000-0000-000000000000"]);
    const bMap = Object.fromEntries((buyers ?? []).map((b: any) => [b.id, b]));
    return (sold ?? []).map((s: any) => ({ ...s, buyer: bMap[s.sold_to_account_id] ?? null }));
  });

// Twilio direct integration — list all approved toll-free verifications on the main account
export const adminListTwilioApprovedTfns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("Twilio credentials not configured");
    const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

    // Pull approved verifications (paginated)
    const rows: Array<{ sid: string; phone_number: string | null; phone_sid: string | null; status: string; business_name: string | null; date_created: string | null }> = [];
    let url: string | null = `https://messaging.twilio.com/v1/Tollfree/Verifications?Status=TWILIO_APPROVED&PageSize=50`;
    let safety = 20;
    while (url && safety-- > 0) {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Twilio ${res.status}: ${body.slice(0, 300)}`);
      }
      const page: any = await res.json();
      const list = page.tollfree_verifications ?? page.verifications ?? [];
      for (const v of list) {
        rows.push({
          sid: v.sid,
          phone_number: v.tollfree_phone_number ?? null,
          phone_sid: v.tollfree_phone_number_sid ?? null,
          status: v.status,
          business_name: v.business_name ?? null,
          date_created: v.date_created ?? null,
        });
      }
      const next = page.meta?.next_page_url ?? null;
      url = next && typeof next === "string" ? next : null;
    }

    // Cross-reference with sender_assets to show current assignment
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const numbers = rows.map(r => r.phone_number).filter(Boolean) as string[];
    const { data: assets } = await supabaseAdmin
      .from("sender_assets")
      .select("phone_number,account_id,accounts:account_id(email,full_name)")
      .in("phone_number", numbers.length ? numbers : ["__none__"]);
    const aMap = Object.fromEntries((assets ?? []).map((a: any) => [a.phone_number, a]));
    return rows.map(r => ({
      ...r,
      assigned_to: r.phone_number ? (aMap[r.phone_number]?.accounts ?? null) : null,
      assigned_account_id: r.phone_number ? (aMap[r.phone_number]?.account_id ?? null) : null,
    }));
  });

export const adminAssignTwilioNumberToAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone_number: z.string().min(6),
      account_id: z.string().uuid(),
      country: z.string().default("US"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Check if already assigned
    const { data: existing } = await supabaseAdmin
      .from("sender_assets")
      .select("id,account_id")
      .eq("phone_number", data.phone_number)
      .maybeSingle();
    if (existing) {
      if (existing.account_id === data.account_id) return { ok: true, already: true };
      throw new Error("This number is already assigned to another tenant");
    }
    const { error } = await supabaseAdmin.from("sender_assets").insert({
      account_id: data.account_id,
      country_code: data.country,
      sender_kind: "toll_free",
      phone_number: data.phone_number,
      verification_status: "verified",
      last_synced_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUnassignSenderAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone_number: z.string().min(6) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sender_assets").delete().eq("phone_number", data.phone_number);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
