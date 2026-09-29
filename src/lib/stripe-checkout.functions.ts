import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkCardEligibility } from "@/lib/payment-geo.server";

// International card payments. Provider details stay server-side only.

/** Public: can this visitor pay by card from their current location/network? */
export const getCardEligibility = createServerFn({ method: "GET" }).handler(async () => {
  const { isCardProcessorConfigured } = await import("@/lib/flw.server");
  if (!isCardProcessorConfigured()) {
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
    const { isCardProcessorConfigured, createHostedPayment } = await import("@/lib/flw.server");
    if (!isCardProcessorConfigured()) {
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

    const { data: userRes } = await context.supabase.auth.getUser();
    const email = userRes?.user?.email;
    if (!email) return { error: "Your account needs an email address to pay by card." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: context.userId,
        pack_id: packId,
        provider: "flutterwave",
        currency: "USD",
        amount: amountUsd,
        credits,
        status: "pending",
        metadata: { label, custom: !packId, country: eligibility.country },
      })
      .select("id")
      .single();
    if (payErr) return { error: payErr.message };

    const reference = `icp_${payment.id.replace(/-/g, "")}`;
    await supabaseAdmin.from("payments").update({ provider_reference: reference }).eq("id", payment.id);

    try {
      const sep = data.returnUrl.includes("?") ? "&" : "?";
      const url = await createHostedPayment({
        reference,
        amountUsd,
        email,
        label,
        redirectUrl: `${data.returnUrl}${sep}ref=${reference}`,
      });
      return { url, reference };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Card checkout failed";
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", admin_note: msg })
        .eq("id", payment.id);
      return { error: "Card checkout could not start — please try again or use another method." };
    }
  });

/** Confirm a card payment directly with the processor (used on redirect-back). */
export const verifyCardPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => {
    if (!d?.reference?.startsWith("icp_") && !d?.reference?.startsWith("stp_"))
      throw new Error("reference required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id,account_id,status")
      .eq("provider_reference", data.reference)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found");
    if (payment.account_id !== context.userId) throw new Error("Reference does not belong to this account");
    if (payment.status === "paid") return { status: "success" as const };
    if (payment.status === "failed") return { status: "failed" as const };
    if (!data.reference.startsWith("icp_")) return { status: "pending" as const };

    const { settleCardPayment } = await import("@/lib/card-settle.server");
    const r = await settleCardPayment(data.reference);
    return { status: r === "not_found" ? ("pending" as const) : r };
  });
