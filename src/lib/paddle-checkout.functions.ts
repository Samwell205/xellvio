import { priceCustomTopUp } from "@/lib/custom-topup";
import { resolveBillingAccount } from "./billing-account.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPaddleConfigured } from "@/lib/paddle.server";
import { checkCardEligibility } from "@/lib/payment-geo.server";

/** Map pack price (USD) → human-readable Paddle price ID. */
const PACK_PRICE_TO_PADDLE: Record<number, string> = {
  5: "price_starter",
  10: "price_basic",
  25: "price_growth",
  50: "price_pro",
  100: "price_scale",
  250: "price_business",
  500: "price_enterprise",
  1000: "price_enterprise_plus",
};

/** Public: can this visitor pay by international card from their location? */
export const getCardEligibility = createServerFn({ method: "GET" }).handler(
  async () => {
    if (!isPaddleConfigured()) {
      return {
        allowed: false,
        country: null,
        reason: "unknown_location" as const,
        message:
          "Card payments are not set up yet. Please use Card / Bank or crypto for now.",
      };
    }
    const req = getRequest();
    return await checkCardEligibility(req.headers);
  },
);

type CheckoutResult =
  | { reference: string; priceId: string; quantity: number; email?: string }
  | { error: string };

/** Create a pending Paddle payment row and return checkout details. */
export const createPaddleCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { packId?: string; amount?: number }) => {
    if (d.packId) return { packId: d.packId };
    return { amount: priceCustomTopUp(d.amount).amountUsd };
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const acting = await resolveBillingAccount(context.userId);
    if (!isPaddleConfigured()) {
      return {
        error: "Card payments are not set up yet — please pay by Card / Bank or crypto.",
      };
    }

    const req = getRequest();
    const eligibility = await checkCardEligibility(req.headers);
    if (!eligibility.allowed) return { error: eligibility.message };

    let amountUsd: number;
    let credits: number;
    let label: string;
    let packId: string | null = null;
    let priceId: string;
    let quantity: number;

    if ("packId" in data && data.packId) {
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

      priceId = PACK_PRICE_TO_PADDLE[amountUsd];
      if (!priceId) return { error: "This pack is not available for card checkout" };
      quantity = 1;
    } else {
      ({ amountUsd, credits } = priceCustomTopUp((data as { amount: number }).amount));
      label = `${amountUsd} USD credits`;
      priceId = "price_custom_credit";
      quantity = amountUsd;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        account_id: acting.accountId,
        pack_id: packId,
        provider: "paddle",
        currency: "USD",
        amount: amountUsd,
        credits,
        status: "pending",
        metadata: { payer_user_id: context.userId, label, custom: !packId, country: eligibility.country },
      })
      .select("id")
      .single();
    if (payErr) return { error: payErr.message };

    const reference = `pdl_${payment.id.replace(/-/g, "")}`;
    await supabaseAdmin
      .from("payments")
      .update({ provider_reference: reference })
      .eq("id", payment.id);

    const { data: userRes } = await context.supabase.auth.getUser();

    return {
      reference,
      priceId,
      quantity,
      email: userRes?.user?.email ?? undefined,
    };
  });

/** Check whether a Paddle payment has been fulfilled (for billing-page polling). */
export const verifyPaddlePayment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => d)
  .handler(async ({ data, context }) => {
    const acting = await resolveBillingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("status,account_id")
      .eq("provider_reference", data.reference)
      .maybeSingle();
    if (!payment || payment.account_id !== acting.accountId) return { status: "not_found" as const };
    if (payment.status === "paid") return { status: "success" as const };
    if (payment.status === "failed") return { status: "failed" as const };
    return { status: "pending" as const };
  });

