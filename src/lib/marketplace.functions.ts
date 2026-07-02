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

async function readPricing() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("key,value")
    .in("key", [
      "marketplace_buyer_price_usd",
      "marketplace_seller_payout_usd",
      "marketplace_seller_verification_fee_usd",
    ]);
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  const toNum = (v: any, fallback: number) => {
    const n = typeof v === "string" ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    buyerPrice: toNum(map.marketplace_buyer_price_usd, 15),
    sellerPayout: toNum(map.marketplace_seller_payout_usd, 10),
    verificationFee: toNum(map.marketplace_seller_verification_fee_usd, 3.5),
  };
}

// ============ SELLER SIGN-UP / STATUS ============

export const becomeSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({ is_seller: true })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSellerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("accounts")
      .select("is_seller,seller_balance,seller_lifetime_earnings,full_name,email")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const pricing = await readPricing();
    return {
      isSeller: !!data?.is_seller,
      balance: Number(data?.seller_balance ?? 0),
      lifetimeEarnings: Number(data?.seller_lifetime_earnings ?? 0),
      fullName: data?.full_name ?? null,
      email: data?.email ?? null,
      pricing,
    };
  });

// ============ PAYSTACK BANK ============

export const listNigerianBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const banks = await paystack<any[]>("/bank?country=nigeria&perPage=100");
    return (banks ?? []).map((b: any) => ({ code: b.code, name: b.name }));
  });

export const resolveBankAccount = createServerFn({ method: "POST" })
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

export const getMyPayoutAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("seller_payout_accounts")
      .select("bank_code,bank_name,account_number,account_name,resolved_at")
      .eq("account_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const savePayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      bank_code: z.string().min(2),
      bank_name: z.string().min(2),
      account_number: z.string().regex(/^\d{10}$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Re-resolve server-side so the stored name is authoritative.
    const resolved = await paystack<{ account_number: string; account_name: string }>(
      `/bank/resolve?account_number=${data.account_number}&bank_code=${data.bank_code}`,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("seller_payout_accounts")
      .upsert({
        account_id: context.userId,
        bank_code: data.bank_code,
        bank_name: data.bank_name,
        account_number: resolved.account_number,
        account_name: resolved.account_name,
        resolved_at: new Date().toISOString(),
      }, { onConflict: "account_id" });
    if (error) throw new Error(error.message);
    return { ok: true, account_name: resolved.account_name };
  });

// ============ LISTINGS ============

export const listMyListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("marketplace_listings")
      .select("id,phone_number,status,seller_payout_amount,buyer_price_amount,sold_at,created_at,sender_asset_id,tollfree_attempt_id")
      .eq("seller_account_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("seller_ledger")
      .select("id,type,amount,balance_after,description,created_at")
      .eq("account_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ WITHDRAWALS ============

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ amount: z.number().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payout } = await supabaseAdmin
      .from("seller_payout_accounts")
      .select("bank_code,bank_name,account_number,account_name")
      .eq("account_id", context.userId)
      .maybeSingle();
    if (!payout) throw new Error("Add your bank details before requesting a withdrawal.");

    const { data: acct } = await supabaseAdmin
      .from("accounts")
      .select("seller_balance,email,full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const balance = Number(acct?.seller_balance ?? 0);
    if (balance < data.amount) throw new Error(`You only have $${balance.toFixed(2)} available.`);
    if (data.amount < 5) throw new Error("Minimum withdrawal is $5.");

    const { data: wr, error: wErr } = await supabaseAdmin
      .from("withdrawal_requests")
      .insert({
        seller_account_id: context.userId,
        amount: data.amount,
        payout_account_snapshot: payout,
      })
      .select("id")
      .single();
    if (wErr) throw new Error(wErr.message);

    // Debit seller balance immediately (held until admin marks paid or rejected)
    const { error: dErr } = await supabaseAdmin.rpc("debit_seller_withdrawal", {
      _account_id: context.userId,
      _amount: data.amount,
      _withdrawal_id: wr.id,
      _description: "Withdrawal requested",
    });
    if (dErr) {
      // Rollback the row
      await supabaseAdmin.from("withdrawal_requests").delete().eq("id", wr.id);
      throw new Error(dErr.message);
    }

    // Notify admin
    try {
      const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
      await sendBrandedEmail({
        templateName: "generic",
        recipientEmail: "admin@xellvio.com",
        idempotencyKey: `wr-new-${wr.id}`,
        templateData: {
          subject: `New withdrawal request: $${data.amount.toFixed(2)}`,
          heading: "New seller withdrawal request",
          body: `Seller ${acct?.full_name || acct?.email} requested $${data.amount.toFixed(2)}.\n\nBank: ${payout.bank_name}\nAccount name: ${payout.account_name}\nAccount number: ${payout.account_number}\n\nReview in the admin console.`,
          ctaText: "Open admin",
          ctaUrl: "https://xellvio.lovable.app/admin/marketplace",
        } as any,
      });
    } catch { /* best-effort */ }

    return { id: wr.id };
  });

export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("withdrawal_requests")
      .select("id,amount,status,admin_notes,paid_at,created_at,payout_account_snapshot")
      .eq("seller_account_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ BUYER: MARKETPLACE PURCHASE ============

export const getMarketplaceStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("marketplace_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "available");
    const pricing = await readPricing();
    return { stock: count ?? 0, price: pricing.buyerPrice };
  });

export const buyVerifiedNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pricing = await readPricing();

    // Pick a random available listing
    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("marketplace_listings")
      .select("id,seller_account_id,sender_asset_id,phone_number")
      .eq("status", "available")
      .limit(50);
    if (qErr) throw new Error(qErr.message);
    if (!candidates?.length) throw new Error("No verified numbers available right now.");
    const listing = candidates[Math.floor(Math.random() * candidates.length)];

    // Atomically mark sold (guarantees no double-sell)
    const { data: claim, error: cErr } = await supabaseAdmin
      .from("marketplace_listings")
      .update({
        status: "sold",
        buyer_account_id: context.userId,
        buyer_price_amount: pricing.buyerPrice,
        seller_payout_amount: pricing.sellerPayout,
        sold_at: new Date().toISOString(),
      })
      .eq("id", listing.id)
      .eq("status", "available")
      .select("id,seller_account_id,sender_asset_id,phone_number")
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!claim) throw new Error("That number was just taken — please try again.");

    // Debit buyer
    try {
      const { error: dErr } = await supabaseAdmin.rpc("debit_account", {
        _account_id: context.userId,
        _amount: pricing.buyerPrice,
        _campaign_id: null as any,
        _description: `Verified toll-free number purchase [marketplace:${claim.id}]`,
      });
      if (dErr) throw new Error(dErr.message);
    } catch (e: any) {
      // Roll back
      await supabaseAdmin
        .from("marketplace_listings")
        .update({ status: "available", buyer_account_id: null, sold_at: null })
        .eq("id", claim.id);
      throw new Error(e?.message || "Payment failed");
    }

    // Credit seller
    try {
      await supabaseAdmin.rpc("credit_seller", {
        _account_id: claim.seller_account_id,
        _amount: pricing.sellerPayout,
        _listing_id: claim.id,
        _description: `Sale of ${claim.phone_number ?? "verified number"}`,
      });
    } catch (e) {
      console.warn("[marketplace] credit_seller failed", e);
    }

    // Logical transfer: copy verified sender_asset to buyer
    if (claim.sender_asset_id) {
      const { data: srcAsset } = await supabaseAdmin
        .from("sender_assets")
        .select("*")
        .eq("id", claim.sender_asset_id)
        .maybeSingle();
      if (srcAsset) {
        const { id: _id, account_id: _a, created_at: _c, updated_at: _u, ...clone } = srcAsset as any;
        await supabaseAdmin.from("sender_assets").insert({
          ...clone,
          account_id: context.userId,
          verification_status: "verified",
          last_synced_at: new Date().toISOString(),
        });
        // Mark source as sold so seller can't use it any more
        await supabaseAdmin
          .from("sender_assets")
          .update({ verification_status: "sold" as any })
          .eq("id", claim.sender_asset_id);
      }
    }

    // Also mark tenant onboarding as active
    await supabaseAdmin
      .from("accounts")
      .update({ onboarding_status: "active" })
      .eq("id", context.userId);

    // Notify both parties (best-effort)
    try {
      const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
      const [seller, buyer] = await Promise.all([
        supabaseAdmin.from("accounts").select("email,contact_email,full_name").eq("id", claim.seller_account_id).maybeSingle(),
        supabaseAdmin.from("accounts").select("email,contact_email,full_name").eq("id", context.userId).maybeSingle(),
      ]);
      const sellerEmail = (seller.data?.contact_email || seller.data?.email || "").trim();
      const buyerEmail = (buyer.data?.contact_email || buyer.data?.email || "").trim();
      if (sellerEmail) {
        await sendBrandedEmail({
          templateName: "generic",
          recipientEmail: sellerEmail,
          idempotencyKey: `mkt-sold-${claim.id}`,
          templateData: {
            subject: `Your number ${claim.phone_number ?? ""} was sold`,
            heading: "You made a sale!",
            body: `Your verified toll-free number ${claim.phone_number ?? ""} was purchased. $${pricing.sellerPayout.toFixed(2)} has been credited to your seller balance.`,
            ctaText: "Open dashboard",
            ctaUrl: "https://xellvio.lovable.app/sellers/dashboard",
          } as any,
        });
      }
      if (buyerEmail) {
        await sendBrandedEmail({
          templateName: "generic",
          recipientEmail: buyerEmail,
          idempotencyKey: `mkt-bought-${claim.id}`,
          templateData: {
            subject: `Verified toll-free number ready`,
            heading: "Your number is ready to send",
            body: `You purchased a pre-verified toll-free number: ${claim.phone_number ?? ""}. You can start campaigns right away.`,
            ctaText: "Start a campaign",
            ctaUrl: "https://xellvio.lovable.app/app/campaigns/new",
          } as any,
        });
      }
    } catch (e) {
      console.warn("[marketplace] notification failed", e);
    }

    return { ok: true, phoneNumber: claim.phone_number };
  });

// ============ ADMIN ============

async function assertAdmin(ctx: any) {
  const { data } = await ctx.supabase.rpc("has_role", { _role: "admin" });
  if (data !== true) throw new Error("Forbidden");
}

export const adminListListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("marketplace_listings")
      .select("id,phone_number,status,seller_account_id,buyer_account_id,buyer_price_amount,seller_payout_amount,sold_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set([
      ...(data ?? []).map((r: any) => r.seller_account_id).filter(Boolean),
      ...(data ?? []).map((r: any) => r.buyer_account_id).filter(Boolean),
    ]));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: a } = await supabaseAdmin.from("accounts").select("id,email,full_name").in("id", ids);
      names = Object.fromEntries((a ?? []).map((r: any) => [r.id, r.full_name || r.email]));
    }
    return (data ?? []).map((r: any) => ({
      ...r,
      seller_name: names[r.seller_account_id] ?? null,
      buyer_name: r.buyer_account_id ? (names[r.buyer_account_id] ?? null) : null,
    }));
  });

export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,seller_account_id,amount,status,admin_notes,paid_at,created_at,payout_account_snapshot")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.seller_account_id)));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: a } = await supabaseAdmin.from("accounts").select("id,email,full_name").in("id", ids);
      names = Object.fromEntries((a ?? []).map((r: any) => [r.id, r.full_name || r.email]));
    }
    return (data ?? []).map((r: any) => ({
      ...r,
      seller_name: names[r.seller_account_id] ?? null,
    }));
  });

export const adminMarkWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["paid", "rejected"]),
      notes: z.string().max(1000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: wr, error: e1 } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,seller_account_id,amount,status")
      .eq("id", data.id)
      .maybeSingle();
    if (e1 || !wr) throw new Error(e1?.message || "Not found");
    if (wr.status !== "pending") throw new Error("Already processed");

    if (data.status === "rejected") {
      // Refund the held balance
      const { data: acct } = await supabaseAdmin.from("accounts")
        .select("seller_balance").eq("id", wr.seller_account_id).maybeSingle();
      const newBal = Number(acct?.seller_balance ?? 0) + Number(wr.amount);
      await supabaseAdmin.from("accounts").update({ seller_balance: newBal }).eq("id", wr.seller_account_id);
      await supabaseAdmin.from("seller_ledger").insert({
        account_id: wr.seller_account_id,
        type: "adjustment",
        amount: Number(wr.amount),
        balance_after: newBal,
        withdrawal_id: wr.id,
        description: `Withdrawal rejected: ${data.notes || "no reason given"}`,
      });
    }

    const { error: uErr } = await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: data.status,
        admin_notes: data.notes ?? null,
        paid_at: data.status === "paid" ? new Date().toISOString() : null,
        paid_by: context.userId,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    // Email seller
    try {
      const { data: seller } = await supabaseAdmin.from("accounts")
        .select("email,contact_email,full_name").eq("id", wr.seller_account_id).maybeSingle();
      const to = (seller?.contact_email || seller?.email || "").trim();
      if (to) {
        const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
        await sendBrandedEmail({
          templateName: "generic",
          recipientEmail: to,
          idempotencyKey: `wr-${data.status}-${wr.id}`,
          templateData: {
            subject: data.status === "paid" ? `Withdrawal paid: $${Number(wr.amount).toFixed(2)}` : `Withdrawal rejected`,
            heading: data.status === "paid" ? "Your withdrawal has been paid" : "Your withdrawal was rejected",
            body: data.status === "paid"
              ? `Your withdrawal of $${Number(wr.amount).toFixed(2)} has been sent to your bank account.`
              : `Your withdrawal of $${Number(wr.amount).toFixed(2)} was rejected and refunded to your seller balance.${data.notes ? `\n\nReason: ${data.notes}` : ""}`,
            ctaText: "Open dashboard",
            ctaUrl: "https://xellvio.lovable.app/sellers/dashboard",
          } as any,
        });
      }
    } catch { /* best-effort */ }

    return { ok: true };
  });

export const adminGetPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return await readPricing();
  });

export const adminSetPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      buyerPrice: z.number().min(0),
      sellerPayout: z.number().min(0),
      verificationFee: z.number().min(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upserts = [
      { key: "marketplace_buyer_price_usd", value: data.buyerPrice as any },
      { key: "marketplace_seller_payout_usd", value: data.sellerPayout as any },
      { key: "marketplace_seller_verification_fee_usd", value: data.verificationFee as any },
    ];
    for (const u of upserts) {
      await supabaseAdmin.from("platform_settings").upsert(u, { onConflict: "key" });
    }
    return { ok: true };
  });
