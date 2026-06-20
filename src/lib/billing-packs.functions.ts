import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYSTACK_API = "https://api.paystack.co";

function paystackKey() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("Paystack is not configured");
  return k;
}

function siteOrigin(): string {
  return process.env.PUBLIC_SITE_URL || "https://samwell-reach-global.lovable.app";
}

/** List active packs — readable to any signed-in user. */
export const listCreditPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credit_packs")
      .select("id,name,description,currency,price,credits,display_order,is_popular")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Read shared billing settings (payoneer details + default currency). */
export const getBillingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("billing_settings").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/** Start a Paystack checkout for a pack. Returns the hosted authorization_url. */
export const initPaystackCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { packId: string }) => {
    if (!d?.packId) throw new Error("packId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: pack, error: pErr } = await context.supabase
      .from("credit_packs")
      .select("id,name,currency,price,credits,is_active")
      .eq("id", data.packId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pack || !pack.is_active) throw new Error("Pack not available");

    const { data: account } = await context.supabase
      .from("accounts")
      .select("contact_email,email,legal_business_name")
      .eq("id", context.userId)
      .maybeSingle();
    const email = account?.contact_email || account?.email;
    if (!email) throw new Error("Add a contact email to your account first");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: pack.id,
        provider: "paystack",
        currency: pack.currency,
        amount: pack.price,
        credits: pack.credits,
        status: "pending",
      })
      .select("id")
      .single();
    if (payErr) throw new Error(payErr.message);

    // Paystack merchants in NG can only charge NGN unless the account is
    // multi-currency enabled. For USD packs, convert to NGN using the
    // admin-configured FX rate while keeping the payment record in USD.
    let chargeCurrency = pack.currency as string;
    let chargeAmount = Number(pack.price);
    if (chargeCurrency === "USD") {
      const { data: settings } = await supabaseAdmin
        .from("billing_settings")
        .select("usd_to_ngn_rate")
        .maybeSingle();
      const rate = Number((settings as any)?.usd_to_ngn_rate ?? 1600);
      chargeCurrency = "NGN";
      chargeAmount = +(Number(pack.price) * rate).toFixed(2);
    }
    const amountSubunit = Math.round(chargeAmount * 100);
    const reference = `pmt_${payment.id.replace(/-/g, "")}`;
    const callback_url = `${siteOrigin()}/app/billing?ref=${reference}`;

    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountSubunit,
        currency: chargeCurrency,
        reference,
        callback_url,
        metadata: {
          account_id: context.userId,
          payment_id: payment.id,
          pack_id: pack.id,
          pack_name: pack.name,
          original_currency: pack.currency,
          original_amount: pack.price,
        },
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) {
      await supabaseAdmin.from("payments").update({ status: "failed", admin_note: json?.message ?? "init failed" }).eq("id", payment.id);
      throw new Error(json?.message || `Paystack init failed (${res.status})`);
    }
    await supabaseAdmin.from("payments").update({ provider_reference: reference }).eq("id", payment.id);
    return { authorization_url: json.data.authorization_url as string, reference };
  });

/** Start a Paystack checkout for an arbitrary USD amount (custom credits). 1:1 USD→credits. */
export const initPaystackCheckoutCustom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number }) => {
    const a = Number(d?.amount);
    if (!Number.isFinite(a)) throw new Error("amount required");
    if (a < 5) throw new Error("Minimum is $5");
    if (a > 10000) throw new Error("Maximum is $10,000");
    return { amount: Math.round(a * 100) / 100 };
  })
  .handler(async ({ data, context }) => {
    const { data: account } = await context.supabase
      .from("accounts")
      .select("contact_email,email")
      .eq("id", context.userId)
      .maybeSingle();
    const email = account?.contact_email || account?.email;
    if (!email) throw new Error("Add a contact email to your account first");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: null,
        provider: "paystack",
        currency: "USD",
        amount: data.amount,
        credits: data.amount,
        status: "pending",
      })
      .select("id")
      .single();
    if (payErr) throw new Error(payErr.message);

    const { data: settings } = await supabaseAdmin
      .from("billing_settings")
      .select("usd_to_ngn_rate")
      .maybeSingle();
    const rate = Number((settings as any)?.usd_to_ngn_rate ?? 1600);
    const chargeAmount = +(data.amount * rate).toFixed(2);
    const amountSubunit = Math.round(chargeAmount * 100);
    const reference = `pmt_${payment.id.replace(/-/g, "")}`;
    const callback_url = `${siteOrigin()}/app/billing?ref=${reference}`;

    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountSubunit,
        currency: "NGN",
        reference,
        callback_url,
        metadata: {
          account_id: context.userId,
          payment_id: payment.id,
          custom: true,
          original_currency: "USD",
          original_amount: data.amount,
        },
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) {
      await supabaseAdmin.from("payments").update({ status: "failed", admin_note: json?.message ?? "init failed" }).eq("id", payment.id);
      throw new Error(json?.message || `Paystack init failed (${res.status})`);
    }
    await supabaseAdmin.from("payments").update({ provider_reference: reference }).eq("id", payment.id);
    return { authorization_url: json.data.authorization_url as string, reference };
  });



/** Manually record a Payoneer payment (customer says they paid externally). */
export const submitPayoneerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { packId: string; proofPath?: string; note?: string }) => {
    if (!d?.packId) throw new Error("packId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: pack, error: pErr } = await context.supabase
      .from("credit_packs").select("id,currency,price,credits,is_active").eq("id", data.packId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pack || !pack.is_active) throw new Error("Pack not available");

    const { data: payment, error } = await context.supabase
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: pack.id,
        provider: "payoneer",
        currency: pack.currency,
        amount: pack.price,
        credits: pack.credits,
        status: "pending",
        proof_url: data.proofPath ?? null,
        customer_note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: payment.id };
  });

/** Customer payment history. */
export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select("id,provider,currency,amount,credits,status,paid_at,created_at,admin_note,provider_reference,pack_id")
      .eq("account_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Verify a Paystack reference on demand (from callback page). */
export const verifyPaystack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => {
    if (!d?.reference) throw new Error("reference required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${paystackKey()}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status) throw new Error(json?.message || "Verify failed");
    const status = json.data?.status as string;
    const meta = json.data?.metadata ?? {};
    if (meta.account_id !== context.userId) throw new Error("Reference does not belong to this account");
    if (status === "success") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await creditFromPayment(supabaseAdmin, data.reference);
    }
    return { status };
  });

/** Idempotently mark a payment paid and call topup_account. Used by webhook + verify. */
export async function creditFromPayment(supabaseAdmin: any, reference: string) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,account_id,status,credits,currency,amount,pack_id")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (!payment) return { ok: false, reason: "not_found" };
  if (payment.status === "paid") return { ok: true, already: true };

  await supabaseAdmin.rpc("topup_account", {
    _account_id: payment.account_id,
    _amount: payment.credits,
    _description: `Paystack ${payment.currency} ${payment.amount} — ${reference}`,
  });
  await supabaseAdmin
    .from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", payment.id);
  return { ok: true };
}
