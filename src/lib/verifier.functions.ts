import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PAYSTACK_API = "https://api.paystack.co";
const SIGNUP_CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateSignupCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

async function hashSignupCode(email: string, code: string) {
  const encoded = new TextEncoder().encode(`${normalizeEmail(email)}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifierEmailExists(supabaseAdmin: any, email: string) {
  const normalized = normalizeEmail(email);
  const { data: verifier } = await supabaseAdmin
    .from("verifiers")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();
  if (verifier) return true;

  let page = 1;
  while (page <= 20) {
    const { data: pageData, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = pageData.users.find((user: any) => user.email?.toLowerCase() === normalized);
    if (hit) return true;
    if (pageData.users.length < 200) break;
    page++;
  }
  return false;
}

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

// ============ Email pre-check (used before signup) ============

export const checkVerifierEmailAvailable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { available: !(await verifierEmailExists(supabaseAdmin, data.email)) };
  });

export const sendVerifierSignupCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      full_name: z.string().trim().min(2).max(120),
      email: z.string().email(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (await verifierEmailExists(supabaseAdmin, email)) {
      throw new Error("An account with this email already exists — please sign in instead.");
    }

    const { data: existingCode } = await supabaseAdmin
      .from("verifier_signup_codes")
      .select("updated_at")
      .eq("email", email)
      .maybeSingle();
    if (
      existingCode?.updated_at &&
      Date.now() - new Date(existingCode.updated_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000
    ) {
      throw new Error("Please wait 60 seconds before requesting another code.");
    }

    const code = generateSignupCode();
    const codeHash = await hashSignupCode(email, code);
    const expiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MINUTES * 60_000).toISOString();

    const { error } = await supabaseAdmin
      .from("verifier_signup_codes")
      .upsert(
        {
          email,
          code_hash: codeHash,
          attempts: 0,
          consumed_at: null,
          expires_at: expiresAt,
        },
        { onConflict: "email" },
      );
    if (error) throw new Error(error.message);

    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
    const result = await sendBrandedEmail({
      templateName: "verifier-signup-code",
      recipientEmail: email,
      idempotencyKey: `verifier-signup-code-${crypto.randomUUID()}`,
      templateData: {
        name: data.full_name,
        code,
        expiresMinutes: SIGNUP_CODE_TTL_MINUTES,
      },
      includeUnsubscribe: false,
    });

    if (!result.success) {
      throw new Error("Could not send the verification code. Please try again.");
    }

    return { ok: true };
  });

export const createVerifierAccountWithCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      full_name: z.string().trim().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(8),
      code: z.string().regex(/^\d{6}$/),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = normalizeEmail(data.email);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: rowError } = await supabaseAdmin
      .from("verifier_signup_codes")
      .select("id,code_hash,attempts,expires_at,consumed_at")
      .eq("email", email)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row || row.consumed_at) throw new Error("Invalid verification code.");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("That code has expired. Please request a new one.");
    if ((row.attempts ?? 0) >= 5) throw new Error("Too many incorrect attempts. Please request a new code.");

    const submittedHash = await hashSignupCode(email, data.code);
    if (submittedHash !== row.code_hash) {
      await supabaseAdmin
        .from("verifier_signup_codes")
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq("id", row.id);
      throw new Error("Invalid verification code.");
    }

    if (await verifierEmailExists(supabaseAdmin, email)) {
      await supabaseAdmin
        .from("verifier_signup_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new Error("An account with this email already exists — please sign in instead.");
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, verifier_signup: true },
    });
    if (createError || !created?.user?.id) {
      throw new Error(createError?.message?.includes("already") ? "An account with this email already exists — please sign in instead." : createError?.message ?? "Could not create account.");
    }

    const userId = created.user.id;
    const { data: verifier, error: verifierError } = await supabaseAdmin
      .from("verifiers")
      .insert({ user_id: userId, full_name: data.full_name, email })
      .select("id")
      .single();
    if (verifierError || !verifier?.id) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
      throw new Error(verifierError?.message ?? "Could not create verifier profile.");
    }

    const { error: walletError } = await supabaseAdmin
      .from("verifier_wallets")
      .insert({ verifier_id: verifier.id });
    if (walletError) {
      await supabaseAdmin.from("verifiers").delete().eq("id", verifier.id);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
      throw new Error(walletError.message);
    }

    await supabaseAdmin
      .from("verifier_signup_codes")
      .update({ consumed_at: new Date().toISOString(), attempts: row.attempts ?? 0 })
      .eq("id", row.id);

    return { ok: true };
  });

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
      .select("id,phone_number,country,status,rejection_reason,sold_at,payout_ngn,created_at,submitted_at,in_review_at,verified_at,rejected_at,telnyx_verification_id,notes")
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
    const { count: activeCount } = await supabaseAdmin
      .from("verifier_tfns")
      .select("id", { count: "exact", head: true })
      .eq("verifier_id", verifier.id)
      .neq("status", "sold");
    if ((activeCount ?? 0) >= 3) {
      throw new Error("You can have at most 3 numbers in the marketplace at a time. Sell one before submitting a new number.");
    }

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
    const { count: activeCount } = await supabaseAdmin
      .from("verifier_tfns")
      .select("id", { count: "exact", head: true })
      .eq("verifier_id", verifier.id)
      .neq("status", "sold");
    if ((activeCount ?? 0) >= 3) {
      throw new Error("You can have at most 3 numbers in the marketplace at a time. Sell one before claiming a new number.");
    }


    // 1) Try to reuse an unclaimed pool number (verifier_id is set to a
    //    platform sentinel — we treat any row with status 'pool_available'
    //    as claimable). Since verifier_id is NOT NULL we simply skip this
    //    step here and always purchase fresh; future pool logic can plug in.

    // 2) Buy a fresh toll-free from Telnyx into the verifier owner's account
    //    (the platform's messaging profile — verifier does not have a tenant
    //    account, so we use the current user's own account id).
    const { autoPurchaseNumber } = await import("./auto-provision-number.server");
    let purchased: { id: string; phone_number: string; messaging_profile_id: string };
    try {
      purchased = await autoPurchaseNumber({
        country: "US",
        number_type: "toll_free",
        accountId: context.userId,
        friendlyName: `Verifier ${verifier.id.slice(0, 8)}`,
      });
    } catch (e: any) {
      throw new Error(e?.message ?? "Could not purchase a number from Telnyx");
    }

    const { data: row, error } = await supabaseAdmin
      .from("verifier_tfns")
      .insert({
        verifier_id: verifier.id,
        phone_number: purchased.phone_number,
        country: "US",
        status: "assigned",
        telnyx_number_id: purchased.id,
        notes: "Auto-provisioned from Telnyx pool",
      })
      .select("id,phone_number")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, phone_number: row.phone_number };
  });

// Move an assigned number into pending_verification once the verifier has
// actually submitted the verification details.
export const submitAssignedTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      notes: z.string().max(10000).optional(),
      payload: z.any().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifier } = await supabaseAdmin
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) throw new Error("Complete your verifier profile first");
    const { data: row, error } = await supabaseAdmin
      .from("verifier_tfns")
      .select("id,telnyx_number_id,telnyx_verification_id,phone_number,status,rejection_reason")
      .eq("id", data.id)
      .eq("verifier_id", verifier.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Number not found");
    if (row.status !== "assigned" && row.status !== "rejected" && row.status !== "pending_verification") {
      throw new Error("This number is no longer awaiting submission");
    }

    // Parse structured payload out of notes JSON when caller didn't pass one.
    let payload: any = data.payload ?? null;
    if (!payload && data.notes) {
      try { payload = JSON.parse(data.notes); } catch { payload = null; }
    }

    let twilioVerificationSid: string | null = row.telnyx_verification_id ?? null;
    let carrierStatus: "submitted" | "in_review" | "verified" | "rejected" = "submitted";
    let rejectionReason: string | null = null;

    if (payload && row.telnyx_number_id) {
      const base = process.env.PUBLIC_BASE_URL ?? "https://xellvio.com";
      const { submitTwilioTollfreeVerification } = await import("./tollfree-submit.server");
      try {
        const result = await submitTwilioTollfreeVerification({
          phoneSid: row.telnyx_number_id,
          phoneNumberE164: row.phone_number,
          accountSid: "",
          authToken: "",
          existingVerificationSid: twilioVerificationSid,
          statusCallbackUrl: `${base}/api/public/telnyx-status`,
          payload: payload as any,
        });
        twilioVerificationSid = result.verificationSid;
        carrierStatus = result.status;
        rejectionReason = result.rejectionReason;
      } catch (e: any) {
        console.error("[verifier submit tfn] carrier submit failed", e?.message, e?.telnyxResponse);
        throw new Error(e?.message ?? "Carrier rejected the submission");
      }
    }

    const dbStatus =
      carrierStatus === "verified" ? "verified" :
      carrierStatus === "rejected" ? "rejected" : "pending_verification";

    const nowIso = new Date().toISOString();
    const patch = {
      status: dbStatus,
      notes: data.notes ?? null,
      telnyx_verification_id: twilioVerificationSid,
      rejection_reason: rejectionReason,
      submitted_at: nowIso,
      ...(carrierStatus === "in_review" ? { in_review_at: nowIso } : {}),
      ...(dbStatus === "verified" ? { verified_at: nowIso } : {}),
      ...(dbStatus === "rejected" ? { rejected_at: nowIso } : {}),
    };

    const { error: upErr } = await supabaseAdmin
      .from("verifier_tfns")
      .update(patch as any)

      .eq("id", data.id)
      .eq("verifier_id", verifier.id);
    if (upErr) throw new Error(upErr.message);


    return { ok: true, verificationSid: twilioVerificationSid, status: dbStatus };
  });

// Poll Twilio for the current verification status of this verifier's TFN.
export const refreshMyTfn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: verifier } = await supabaseAdmin
      .from("verifiers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!verifier) throw new Error("Complete your verifier profile first");
    const { data: row } = await supabaseAdmin
      .from("verifier_tfns")
      .select("id,telnyx_verification_id,status")
      .eq("id", data.id)
      .eq("verifier_id", verifier.id)
      .maybeSingle();
    if (!row?.telnyx_verification_id) return { ok: false, reason: "not_submitted" };
    const { fetchTwilioTollfreeVerification } = await import("./tollfree-submit.server");
    const result = await fetchTwilioTollfreeVerification({
      verificationSid: row.telnyx_verification_id,
      accountSid: "",
      authToken: "",
    });
    const dbStatus =
      result.status === "verified" ? "verified" :
      result.status === "rejected" ? "rejected" : "pending_verification";
    const nowIso = new Date().toISOString();
    const patch: any = { status: dbStatus, rejection_reason: result.rejectionReason };
    if (result.status === "in_review") patch.in_review_at = nowIso;
    if (dbStatus === "verified") patch.verified_at = nowIso;
    if (dbStatus === "rejected") patch.rejected_at = nowIso;
    await supabaseAdmin.from("verifier_tfns").update(patch).eq("id", data.id);

    return { ok: true, status: dbStatus };
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
