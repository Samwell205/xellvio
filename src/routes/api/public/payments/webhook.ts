import { createFileRoute } from "@tanstack/react-router";
import { verifyPaddleWebhook, type PaddleEnv } from "@/lib/paddle.server";
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

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyPaddleWebhook(req, env);
  const data = event?.data ?? {};
  const reference: string | undefined = data?.custom_data?.reference;

  switch (event?.event_type) {
    case "transaction.completed":
      await fulfill(reference);
      break;
    case "transaction.payment_failed":
    case "transaction.canceled":
      await markFailed(reference);
      break;
    default:
      console.log("Unhandled payments event:", event?.event_type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const env = (url.searchParams.get("env") as PaddleEnv) || "sandbox";
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("payments webhook error", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
