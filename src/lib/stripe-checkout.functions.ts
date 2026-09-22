import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage, isStripeConfigured } from "@/lib/stripe.server";
import { checkCardEligibility } from "@/lib/payment-geo.server";

/** Public: can this visitor pay by card from their current location/network? */
export const getCardEligibility = createServerFn({ method: "GET" }).handler(async () => {
  if (!isStripeConfigured()) {
    return {
      allowed: false,
      country: null,
      reason: "unknown_location" as const,
      message: "Card payments are not set up yet. Please use bank/card or crypto for now.",
    };
  }
  const req = getRequest();
  return await checkCardEligibility(req.headers);
});

type CheckoutResult = { url: string; reference: string } | { error: string };

async function createSession(opts: {
  amountUsd: number;
  credits: number;
  label: string;
  reference: string;
  accountId: string;
  email?: string;
  returnUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = createStripeClient();
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
    success_url: opts.returnUrl,
    cancel_url: opts.returnUrl.split("?")[0],
    client_reference_id: opts.reference,
    ...(opts.email && { customer_email: opts.email }),
    payment_intent_data: { description: opts.label },
    metadata: {
      reference: opts.reference,
      userId: opts.accountId,
      credits: String(opts.credits),
    },
  });
  return { url: session.url ?? "", sessionId: session.id };
}


/** Start a card checkout for a credit pack or a custom USD amount. */
export const createCardCreditCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { packId?: string; amount?: number; returnUrl: string }) => {
    if (!d.returnUrl?.startsWith("http")) throw new Error("Invalid return URL");
    if (!d.packId) {
      const a = Number(d.amount);
      if (!Number.isFinite(a) || a < 5) throw new Error("Minimum is $5");
      if (a > 10000) throw new Error("Maximum is $10,000");
      return { returnUrl: d.returnUrl, amount: Math.round(a * 100) / 100 };
    }
    return { returnUrl: d.returnUrl, packId: d.packId };
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    if (!isStripeConfigured()) {
      return { error: "Card payments are not set up yet — please pay by bank/card or crypto." };
    }
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
      const { url, sessionId } = await createSession({
        amountUsd,
        credits,
        label,
        reference,
        accountId: context.userId,
        email: userRes?.user?.email ?? undefined,
        returnUrl: data.returnUrl,
      });
      if (!url) return { error: "Card checkout did not start — please try again." };
      await supabaseAdmin
        .from("payments")
        .update({
          metadata: { label, custom: !packId, country: eligibility.country, session_id: sessionId },
        })
        .eq("id", payment.id);
      return { url, reference };
    } catch (error) {
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", admin_note: getStripeErrorMessage(error) })
        .eq("id", payment.id);
      return { error: getStripeErrorMessage(error) };
    }
  });


/**
 * Confirm a card payment straight from Stripe (used on redirect-back, so a
 * missed or mis-signed webhook never leaves a paid customer uncredited).
 */
export const verifyCardPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => {
    if (!d?.reference?.startsWith("stp_")) throw new Error("reference required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id,account_id,status,metadata")
      .eq("provider_reference", data.reference)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found");
    if (payment.account_id !== context.userId) throw new Error("Reference does not belong to this account");
    if (payment.status === "paid") return { status: "success" as const };

    const sessionId = (payment.metadata as any)?.session_id as string | undefined;
    if (!sessionId) return { status: "pending" as const };

    const stripe = createStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== data.reference) return { status: "pending" as const };

    if (session.payment_status === "paid") {
      const { creditFromPayment } = await import("./billing-packs.functions");
      const result = await creditFromPayment(supabaseAdmin, data.reference);
      if (result?.ok && !result.already) {
        const { notifyPaymentReceipt } = await import("./payment-receipt.server");
        await notifyPaymentReceipt(supabaseAdmin, data.reference, "card").catch(() => {});
      }
      return { status: "success" as const };
    }
    if (session.status === "expired") {
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", admin_note: "Checkout expired" })
        .eq("id", payment.id)
        .eq("status", "pending");
      return { status: "failed" as const };
    }
    return { status: "pending" as const };
  });
