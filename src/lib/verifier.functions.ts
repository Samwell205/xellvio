import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PAYSTACK_API = "https://api.paystack.co";

async function paystack<T = any>(path: string): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Payments provider is not configured");
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.status) {
    throw new Error(json?.message || `Paystack error ${res.status}`);
  }
  return json.data as T;
}

// ============ Status / signup ============

export const getMyVerifier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: verifier } = await context.supabase
      .from("verifiers")
      .select("id,full_name,email,is_active,created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!verifier) return { verifier: null, bank: null, wallet: null };
    const [{ data: bank }, { data: wallet }] = await Promise.all([
      context.supabase
        .from("verifier_bank_accounts")
        .select("bank_code,bank_name,account_number,account_name")
        .eq("verifier_id", verifier.id)
        .maybeSingle(),
      context.supabase
        .from("verifier_wallets")
        .select("balance_ngn,lifetime_earned_ngn")
        .eq("verifier_id", verifier.id)
        .maybeSingle(),
    ]);
    return { verifier, bank: bank ?? null, wallet: wallet ?? null };
  });

export const createVerifierProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      full_name: z.string().trim().min(2).max(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("verifiers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { id: existing.id };
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user?.user?.email ?? "";
    const { data: v, error } = await supabaseAdmin
      .from("verifiers")
      .insert({ user_id: context.userId, full_name: data.full_name, email })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("verifier_wallets").insert({ verifier_id: v.id });
    return { id: v.id };
  });

// ============ Banks ============

export const listVerifierBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const banks = await paystack<any[]>("/bank?country=nigeria&perPage=100");
    return (banks ?? []).map((b: any) => ({ code: b.code, name: b.name }));
  });

export const resolveVerifierBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      account_number: z.string().regex(/^\d{10}$/, "Must be 10 digits"),
      bank_code: z.string().min(2),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const res = await paystack<{ account_number: string; account_name: string }>(
      `/bank/resolve?account_number=${data.account_number}&bank_code=${data.bank_code}`,
    );
    return { account_number: res.account_number, account_name: res.account_name };
  });

export const saveVerifierBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      bank_code: z.string().min(2),
      bank_name: z.string().min(2),
      account_number: z.string().regex(/^\d{10}$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const resolved = await paystack<{ account_number: string; account_name: string }>(
      `/bank/resolve?account_number=${data.account_number}&bank_code=${data.bank_code}`,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifier } = await supabaseAdmin
      .from("verifiers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!verifier) throw new Error("Complete your verifier profile first");
    const { error } = await supabaseAdmin
      .from("verifier_bank_accounts")
      .upsert({
        verifier_id: verifier.id,
        bank_code: data.bank_code,
        bank_name: data.bank_name,
        account_number: resolved.account_number,
        account_name: resolved.account_name,
        resolved_at: new Date().toISOString(),
      }, { onConflict: "verifier_id" });
    if (error) throw new Error(error.message);
    return { ok: true, account_name: resolved.account_name };
  });

// ============ TFN Submissions ============

export const listMyTfns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: verifier } = await context.supabase
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) return [];
    const { data } = await context.supabase
      .from("verifier_tfns")
      .select("id,phone_number,country,status,rejection_reason,sold_at,payout_ngn,created_at")
      .eq("verifier_id", verifier.id)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const submitTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      phone_number: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format e.g. +18885551234"),
      country: z.string().length(2).default("US"),
      notes: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifier } = await supabaseAdmin
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) throw new Error("Complete your verifier profile first");
    const { data: bank } = await supabaseAdmin
      .from("verifier_bank_accounts").select("id").eq("verifier_id", verifier.id).maybeSingle();
    if (!bank) throw new Error("Add your bank details before submitting numbers");
    const { error } = await supabaseAdmin
      .from("verifier_tfns")
      .insert({
        verifier_id: verifier.id,
        phone_number: data.phone_number,
        country: data.country,
        notes: data.notes ?? null,
        status: "pending_verification",
      });
    if (error) throw new Error(error.message.includes("duplicate") ? "This number was already submitted" : error.message);
    return { ok: true };
  });

// Claim a toll-free number to verify: reuse an unassigned platform-pool number
// if any exist, otherwise buy a fresh toll-free from Twilio and assign it to
// the verifier so they can start the verification submission.
export const claimTfnFromPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifier } = await supabaseAdmin
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) throw new Error("Complete your verifier profile first");
    const { data: bank } = await supabaseAdmin
      .from("verifier_bank_accounts").select("id").eq("verifier_id", verifier.id).maybeSingle();
    if (!bank) throw new Error("Add your bank details before claiming a number");

    // 1) Try to reuse an unclaimed pool number (verifier_id is set to a
    //    platform sentinel — we treat any row with status 'pool_available'
    //    as claimable). Since verifier_id is NOT NULL we simply skip this
    //    step here and always purchase fresh; future pool logic can plug in.

    // 2) Buy a fresh toll-free from Twilio.
    const { autoPurchaseNumber } = await import("./auto-provision-number.server");
    let purchased: { sid: string; phone_number: string };
    try {
      purchased = await autoPurchaseNumber({
        country: "US",
        number_type: "toll_free",
        friendlyName: `Verifier ${verifier.id.slice(0, 8)}`,
      });
    } catch (e: any) {
      throw new Error(e?.message ?? "Could not purchase a number from Twilio");
    }

    const { data: row, error } = await supabaseAdmin
      .from("verifier_tfns")
      .insert({
        verifier_id: verifier.id,
        phone_number: purchased.phone_number,
        country: "US",
        status: "pending_verification",
        twilio_phone_sid: purchased.sid,
        notes: "Auto-provisioned from Twilio pool",
      })
      .select("id,phone_number")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, phone_number: row.phone_number };
  });

// ============ Wallet Transactions ============

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: verifier } = await context.supabase
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) return [];
    const { data } = await context.supabase
      .from("verifier_transactions")
      .select("id,type,amount_ngn,balance_after,description,created_at")
      .eq("verifier_id", verifier.id)
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

// ============ Withdrawals ============

export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: verifier } = await context.supabase
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) return [];
    const { data } = await context.supabase
      .from("verifier_withdrawals")
      .select("id,amount_ngn,status,admin_note,requested_at,paid_at")
      .eq("verifier_id", verifier.id)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ amount_ngn: z.number().positive().max(10_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifier } = await supabaseAdmin
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) throw new Error("Complete your verifier profile first");
    const { data: wallet } = await supabaseAdmin
      .from("verifier_wallets").select("balance_ngn").eq("verifier_id", verifier.id).maybeSingle();
    if (!wallet || Number(wallet.balance_ngn) < data.amount_ngn) {
      throw new Error("Insufficient wallet balance");
    }
    const { data: bank } = await supabaseAdmin
      .from("verifier_bank_accounts").select("id").eq("verifier_id", verifier.id).maybeSingle();
    if (!bank) throw new Error("Add your bank details before requesting a withdrawal");

    const { error } = await supabaseAdmin
      .from("verifier_withdrawals")
      .insert({ verifier_id: verifier.id, amount_ngn: data.amount_ngn, status: "pending" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
