import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac } from "crypto";

function sortedStringify(obj: any): string {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return JSON.stringify(obj);
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") + "}";
}

/** Admin-only: simulate a NOWPayments IPN callback for a given payment reference. */
export const simulateNowPaymentsIpn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string; status?: string }) => {
    if (!d?.reference) throw new Error("reference required");
    return { reference: d.reference, status: d.status ?? "finished" };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!secret) throw new Error("NOWPAYMENTS_IPN_SECRET not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id,amount,currency,credits,status")
      .eq("provider_reference", data.reference)
      .maybeSingle();
    if (!payment) throw new Error("Payment not found for reference");

    const payload = {
      payment_id: `sim_${Date.now()}`,
      payment_status: data.status,
      order_id: data.reference,
      order_description: `SIMULATED ${data.reference}`,
      price_amount: Number(payment.amount),
      price_currency: String(payment.currency || "usd").toLowerCase(),
      pay_amount: Number(payment.amount),
      pay_currency: "usdttrc20",
      actually_paid: Number(payment.amount),
      outcome_amount: Number(payment.amount),
      outcome_currency: "usdttrc20",
      payin_hash: `sim_${Date.now().toString(16)}`,
    };

    const body = sortedStringify(payload);
    const signature = createHmac("sha512", secret).update(body).digest("hex");

    const origin = process.env.PUBLIC_SITE_URL || "https://project--91d3bf8a-0d22-4b7d-9569-057a8306639a-dev.lovable.app";
    const res = await fetch(`${origin}/api/public/nowpayments-ipn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-nowpayments-sig": signature },
      body,
    });
    const text = await res.text();

    const { data: after } = await supabaseAdmin
      .from("payments")
      .select("status,paid_at,metadata")
      .eq("id", payment.id)
      .maybeSingle();

    return { ok: res.ok, status: res.status, response: text, before: payment.status, after: after?.status ?? null };
  });
