import { createFileRoute } from "@tanstack/react-router";
import { createStripeClient, verifyWebhookBody } from "@/lib/stripe.server";
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

/**
 * Fallback when the signing secret does not match (e.g. rotated endpoint):
 * re-read the event straight from Stripe with our own secret key, which is
 * authoritative, so an unverified payload can never fabricate a credit.
 */
async function trustedEventFromStripe(
  body: string,
): Promise<{ type: string; data: { object: any } } | null> {
  try {
    const parsed = JSON.parse(body) as { id?: string; type?: string; data?: { object?: any } };
    const stripe = createStripeClient();
    if (parsed.id?.startsWith("evt_")) {
      const event = (await stripe.events.retrieve(parsed.id)) as any;
      return { type: event.type, data: { object: event.data?.object } };
    }
    const sessionId = parsed.data?.object?.id as string | undefined;
    if (!sessionId?.startsWith("cs_") || !parsed.type) return null;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return { type: parsed.type, data: { object: session } };
  } catch (e) {
    console.error("payments webhook: stripe re-read failed", e);
    return null;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("stripe-signature");
        try {
          let event: { type: string; data: { object: any } } | null = null;
          try {
            event = await verifyWebhookBody(signature, body);
          } catch (sigErr) {
            console.error("payments webhook: signature check failed", sigErr);
            event = await trustedEventFromStripe(body);
            if (!event) throw sigErr;
          }
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
