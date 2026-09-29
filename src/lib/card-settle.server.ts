import { verifyByReference } from "./flw.server";

/**
 * Credit a pending international card payment ONLY after the processor
 * confirms it succeeded for the full USD amount. Idempotent.
 */
export async function settleCardPayment(
  reference: string,
): Promise<"success" | "pending" | "failed" | "not_found"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,status,amount,currency")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (!payment) return "not_found";
  if (payment.status === "paid") return "success";

  const tx = await verifyByReference(reference);
  if (!tx) return "pending";
  if (tx.status === "successful") {
    if (tx.currency !== "USD" || tx.amount + 0.001 < Number(payment.amount)) {
      await supabaseAdmin
        .from("payments")
        .update({ admin_note: `Amount mismatch: got ${tx.amount} ${tx.currency}` })
        .eq("id", payment.id);
      return "pending";
    }
    const { creditFromPayment } = await import("./billing-packs.functions");
    const result = await creditFromPayment(supabaseAdmin, reference);
    if (result?.ok && !result.already) {
      const { notifyPaymentReceipt } = await import("./payment-receipt.server");
      await notifyPaymentReceipt(supabaseAdmin, reference, "card").catch(() => {});
    }
    return "success";
  }
  if (tx.status === "failed" || tx.status === "cancelled") {
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed", admin_note: "Card payment failed" })
      .eq("id", payment.id)
      .eq("status", "pending");
    return "failed";
  }
  return "pending";
}
