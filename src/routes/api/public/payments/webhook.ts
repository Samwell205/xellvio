import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhook } from "@/lib/stripe.server";
import { creditFromPayment } from "@/lib/billing-packs.functions";
import { notifyPaymentReceipt } from "@/lib/payment-receipt.server";

async function fulfill(reference: string | undefined) {
  if (!reference) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await creditFromPayment(supabaseAdmin, reference);
  // Only notify on the first successful fulfillment of this reference.
  if (!result?.ok || result.already) return;
  await notifyPaymentReceipt(supabaseAdmin, reference, "card").catch((e) =>
    console.error("payments webhook: notify failed", e),
  );
}

async function markFailed(reference: string | undefined) {
  if (!reference) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("payments")
    .update({ status: "failed", admin_note: "Card payment failed" })
    .eq("provider_reference", reference)
    .eq("status", "pending");
}

async function handleWebhook(req: Request) {
  const event = await verifyWebhook(req);
  const object = event.data?.object ?? {};
  const reference: string | undefined = object?.metadata?.reference;

  switch (event.type) {
    case "checkout.session.completed":
      if (object.payment_status !== "unpaid") await fulfill(reference);
      break;
    case "checkout.session.async_payment_succeeded":
      await fulfill(reference);
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      await markFailed(reference);
      break;
    default:
      console.log("Unhandled payments event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await handleWebhook(request);
          return Response.json({ received: true });
        } catch (e) {
          console.error("payments webhook error", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
