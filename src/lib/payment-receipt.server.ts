/**
 * Shared post-payment notifications: email the customer a receipt and alert
 * the admin. Best-effort — never throws into the webhook path.
 *
 * Called once per payment reference, only on the first successful
 * fulfillment (callers check `creditFromPayment` returned ok && !already).
 */
export async function notifyPaymentReceipt(
  supabaseAdmin: any,
  reference: string,
  methodLabel: string,
) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id,account_id,amount,credits,currency,metadata")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (!payment) return;

  // TFN purchases have their own flow and don't add credits.
  if ((payment.metadata as any)?.purpose === "tfn_purchase") return;

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("email,full_name,company,credit_balance")
    .eq("id", payment.account_id)
    .maybeSingle();

  const label = (payment.metadata as any)?.label ?? "Credit top-up";
  const currency = payment.currency ?? "USD";
  const paid = `${Number(payment.amount).toFixed(2)} ${currency}`;
  const credits = `$${Number(payment.credits).toFixed(2)}`;

  if (account?.email) {
    try {
      const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
      await sendBrandedEmail({
        templateName: "generic",
        recipientEmail: account.email,
        idempotencyKey: `payment-receipt-${reference}`,
        includeUnsubscribe: false,
        sendImmediately: true,
        templateData: {
          subject: `Payment received — ${credits} added to your Xellvio balance`,
          heading: "Payment received",
          body: [
            `Thanks${account.full_name ? `, ${account.full_name}` : ""} — your ${methodLabel} payment went through.`,
            "",
            `Item: ${label}`,
            `Amount paid: ${paid}`,
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
    } catch (e) {
      console.error("payment receipt email failed", e);
    }
  }

  const who = account?.company || account?.full_name || account?.email || payment.account_id;
  const line = `Xellvio: ${methodLabel} payment ${paid} from ${who} (${label}).`;
  try {
    const [{ sendAdminSms }, { sendAdminPush }] = await Promise.all([
      import("@/lib/admin-notify.server"),
      import("@/lib/admin-push.server"),
    ]);
    await Promise.all([
      sendAdminSms(line).catch(() => {}),
      sendAdminPush({
        title: `${methodLabel} payment ${paid}`,
        body: `${who} — ${label}`,
        url: "/admin/billing",
        tag: `paid-${reference}`,
      }).catch(() => {}),
    ]);
  } catch (e) {
    console.error("payment admin notify failed", e);
  }
}
