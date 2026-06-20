import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NP_API = "https://api.nowpayments.io/v1";

function npKey() {
  const k = process.env.NOWPAYMENTS_API_KEY;
  if (!k) throw new Error("NOWPayments is not configured");
  return k;
}

function siteOrigin(): string {
  return process.env.PUBLIC_SITE_URL || "https://xellvio.lovable.app";
}

function ipnUrl(): string {
  // Use stable project URL so IPNs work in preview + production
  return process.env.NOWPAYMENTS_IPN_URL || `${siteOrigin()}/api/public/nowpayments-ipn`;
}

/** Allowed crypto for hosted invoices. NOWPayments expects lowercase tickers. */
const ALLOWED_COINS = ["usdttrc20", "usdtbsc", "usdcbsc", "btc", "eth"] as const;

async function createInvoice(opts: {
  priceUsd: number;
  orderId: string;
  orderDescription: string;
  payCurrency?: string;
}) {
  const body: Record<string, unknown> = {
    price_amount: opts.priceUsd,
    price_currency: "usd",
    order_id: opts.orderId,
    order_description: opts.orderDescription,
    ipn_callback_url: ipnUrl(),
    success_url: `${siteOrigin()}/app/billing?ref=${opts.orderId}`,
    cancel_url: `${siteOrigin()}/app/checkout?ref=${opts.orderId}&cancelled=1`,
    is_fee_paid_by_user: true,
  };
  if (opts.payCurrency) body.pay_currency = opts.payCurrency;

  const res = await fetch(`${NP_API}/invoice`, {
    method: "POST",
    headers: { "x-api-key": npKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.invoice_url) {
    throw new Error(json?.message || `NOWPayments init failed (${res.status})`);
  }
  return { invoice_url: json.invoice_url as string, id: String(json.id ?? "") };
}

/** Create a NOWPayments invoice for an existing credit pack. */
export const initNowPaymentsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { packId: string; coin?: string }) => {
    if (!d?.packId) throw new Error("packId required");
    if (d.coin && !ALLOWED_COINS.includes(d.coin as any)) throw new Error("Unsupported coin");
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
    if (pack.currency !== "USD") throw new Error("Crypto checkout requires a USD pack");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: pack.id,
        provider: "nowpayments",
        currency: "USD",
        amount: pack.price,
        credits: pack.credits,
        status: "pending",
        metadata: { coin: data.coin ?? null, pack_name: pack.name },
      })
      .select("id")
      .single();
    if (payErr) throw new Error(payErr.message);

    const reference = `npm_${payment.id.replace(/-/g, "")}`;
    try {
      const inv = await createInvoice({
        priceUsd: Number(pack.price),
        orderId: reference,
        orderDescription: `${pack.name} — ${pack.credits} credits`,
        payCurrency: data.coin,
      });
      await supabaseAdmin
        .from("payments")
        .update({ provider_reference: reference, metadata: { coin: data.coin ?? null, pack_name: pack.name, np_invoice_id: inv.id } })
        .eq("id", payment.id);
      return { invoice_url: inv.invoice_url, reference };
    } catch (e: any) {
      await supabaseAdmin.from("payments").update({ status: "failed", admin_note: e?.message ?? "init failed" }).eq("id", payment.id);
      throw e;
    }
  });

/** Create a NOWPayments invoice for a custom USD amount (1:1 USD→credits). */
export const initNowPaymentsCheckoutCustom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number; coin?: string }) => {
    const a = Number(d?.amount);
    if (!Number.isFinite(a)) throw new Error("amount required");
    if (a < 5) throw new Error("Minimum is $5");
    if (a > 10000) throw new Error("Maximum is $10,000");
    if (d.coin && !ALLOWED_COINS.includes(d.coin as any)) throw new Error("Unsupported coin");
    return { amount: Math.round(a * 100) / 100, coin: d.coin };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: null,
        provider: "nowpayments",
        currency: "USD",
        amount: data.amount,
        credits: data.amount,
        status: "pending",
        metadata: { coin: data.coin ?? null, custom: true },
      })
      .select("id")
      .single();
    if (payErr) throw new Error(payErr.message);

    const reference = `npm_${payment.id.replace(/-/g, "")}`;
    try {
      const inv = await createInvoice({
        priceUsd: data.amount,
        orderId: reference,
        orderDescription: `${data.amount} USD credits`,
        payCurrency: data.coin,
      });
      await supabaseAdmin
        .from("payments")
        .update({ provider_reference: reference, metadata: { coin: data.coin ?? null, custom: true, np_invoice_id: inv.id } })
        .eq("id", payment.id);
      return { invoice_url: inv.invoice_url, reference };
    } catch (e: any) {
      await supabaseAdmin.from("payments").update({ status: "failed", admin_note: e?.message ?? "init failed" }).eq("id", payment.id);
      throw e;
    }
  });
