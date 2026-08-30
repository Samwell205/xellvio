import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import { checkCardEligibility } from "@/lib/payment-geo.server";

/** Public: can this visitor pay by card from their current location/network? */
export const getCardEligibility = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const result = await checkCardEligibility(req.headers);
  return result;
});

type CheckoutResult = { clientSecret: string; reference: string } | { error: string };

async function createSession(opts: {
  environment: StripeEnv;
  amountUsd: number;
  credits: number;
  label: string;
  reference: string;
  accountId: string;
  email?: string;
  returnUrl: string;
}): Promise<{ clientSecret: string }> {
  const stripe = createStripeClient(opts.environment);
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: opts.label },
          unit_amount: Math.round(opts.amountUsd * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    ui_mode: "embedded_page",
    return_url: opts.returnUrl,
    ...(opts.email && { customer_email: opts.email }),
    payment_intent_data: { description: opts.label },
    managed_payments: { enabled: true },
    metadata: {
      reference: opts.reference,
      userId: opts.accountId,
      credits: String(opts.credits),
      managed_payments: "true",
    },
  } as Stripe.Checkout.SessionCreateParams);
  return { clientSecret: session.client_secret ?? "" };
}

/** Start a card checkout for a credit pack or a custom USD amount. */
export const createCardCreditCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { packId?: string; amount?: number; environment: StripeEnv; returnUrl: string }) => {
    if (d.environment !== "sandbox" && d.environment !== "live") throw new Error("Invalid environment");
    if (!d.returnUrl?.startsWith("http")) throw new Error("Invalid return URL");
    if (!d.packId) {
      const a = Number(d.amount);
      if (!Number.isFinite(a) || a < 5) throw new Error("Minimum is $5");
      if (a > 10000) throw new Error("Maximum is $10,000");
      return { environment: d.environment, returnUrl: d.returnUrl, amount: Math.round(a * 100) / 100 };
    }
    return { environment: d.environment, returnUrl: d.returnUrl, packId: d.packId };
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const req = getRequest();
    const eligibility = await checkCardEligibility(req.headers);
    if (!eligibility.allowed) return { error: eligibility.message };

    let amountUsd: number;
    let credits: number;
    let label: string;
    let packId: string | null = null;

    if (data.packId) {
      const { data: pack, error } = await context.supabase
        .from("credit_packs")
        .select("id,name,currency,price,credits,is_active")
        .eq("id", data.packId)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!pack || !pack.is_active) return { error: "Pack not available" };
      if (pack.currency !== "USD") return { error: "Card checkout requires a USD pack" };
      packId = pack.id;
      amountUsd = Number(pack.price);
      credits = Number(pack.credits);
      label = `${pack.name} — ${credits} credits`;
    } else {
      amountUsd = Number(data.amount);
      credits = amountUsd;
      label = `${amountUsd} USD credits`;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: packId,
        provider: "stripe",
        currency: "USD",
        amount: amountUsd,
        credits,
        status: "pending",
        metadata: {
          label,
          custom: !packId,
          country: eligibility.country,
          environment: data.environment,
        },
      })
      .select("id")
      .single();
    if (payErr) return { error: payErr.message };

    const reference = `stp_${payment.id.replace(/-/g, "")}`;
    await supabaseAdmin
      .from("payments")
      .update({ provider_reference: reference })
      .eq("id", payment.id);

    try {
      const { data: userRes } = await context.supabase.auth.getUser();
      const { clientSecret } = await createSession({
        environment: data.environment,
        amountUsd,
        credits,
        label,
        reference,
        accountId: context.userId,
        email: userRes?.user?.email ?? undefined,
        returnUrl: data.returnUrl,
      });
      if (!clientSecret) return { error: "Card checkout did not start — please try again." };
      return { clientSecret, reference };
    } catch (error) {
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", admin_note: getStripeErrorMessage(error) })
        .eq("id", payment.id);
      return { error: getStripeErrorMessage(error) };
    }
  });
