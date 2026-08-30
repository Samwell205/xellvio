import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { creditFromPayment } from "@/lib/billing-packs.functions";

async function fulfill(reference: string | undefined) {
  if (!reference) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await creditFromPayment(supabaseAdmin, reference);
  // Only notify on the first successful fulfillment of this reference.
  if (!result?.ok || result.already) return;
  await notifyPaid(supabaseAdmin, reference).catch((e) =>
    console.error("payments webhook: notify failed", e),
  );
}

/** Email the tenant a receipt and alert the admin. Best-effort. */
async function notifyPaid(supabaseAdmin: any, reference: string) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,account_id,amount,credits,currency,metadata")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (!payment) return;

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("email,full_name,company,credit_balance")
    .eq("id", payment.account_id)
    .maybeSingle();

  const label = (payment.metadata as any)?.label ?? "Credit top-up";
  const paid = `$${Number(payment.amount).toFixed(2)}`;
  const credits = `$${Number(payment.credits).toFixed(2)}`;

  if (account?.email) {
    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
    await sendBrandedEmail({
      templateName: "generic",
      recipientEmail: account.email,
      idempotencyKey: `card-receipt-${reference}`,
      includeUnsubscribe: false,
      sendImmediately: true,
      templateData: {
        subject: `Payment received — ${paid} added to your Xellvio balance`,
        heading: "Payment received",
        body: [
          `Thanks${account.full_name ? `, ${account.full_name}` : ""} — your card payment went through.`,
          "",
          `Item: ${label}`,
          `Amount paid: ${paid} USD`,
          `Credits added: ${credits}`,
          `New balance: $${Number(account.credit_balance ?? 0).toFixed(2)}`,
          `Reference: ${reference}`,
          "",
          "Your credits are available right now — you can start sending straight away.",
        ].join("\n"),
        ctaText: "Open billing",
        ctaUrl: "https://xellvio.com/app/billing",
      },
    });
  }

  const who = account?.company || account?.full_name || account?.email || payment.account_id;
  const line = `Xellvio: card payment ${paid} from ${who} (${label}).`;
  const [{ sendAdminSms }, { sendAdminPush }] = await Promise.all([
    import("@/lib/admin-notify.server"),
    import("@/lib/admin-push.server"),
  ]);
  await Promise.all([
    sendAdminSms(line).catch(() => {}),
    sendAdminPush({
      title: `Card payment ${paid}`,
      body: `${who} — ${label}`,
      url: "/admin/billing",
      tag: `card-paid-${reference}`,
    }).catch(() => {}),
  ]);
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

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
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
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("payments webhook: invalid env", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("payments webhook error", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
