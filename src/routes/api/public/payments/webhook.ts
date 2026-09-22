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

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const event = await verifyWebhook(request);
          const session = event?.data?.object ?? {};
          const reference: string | undefined =
            session?.metadata?.reference ?? session?.client_reference_id ?? undefined;

          switch (event?.type) {
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded":
              if (session?.payment_status === "paid" || event.type.endsWith("succeeded")) {
                await fulfill(reference);
              }
              break;
            case "checkout.session.async_payment_failed":
            case "checkout.session.expired":
              await markFailed(reference);
              break;
            default:
              console.log("Unhandled payments event:", event?.type);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("payments webhook error", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
