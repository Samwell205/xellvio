// Delivery receipts from the US backup route. Signature-verified, then
// converted to the primary receipt shape so status, spam-gate and tenant
// webhooks behave identically.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const params = new URLSearchParams(raw);
        const { verifyTwilioSignature, twilioStatusUrl } = await import("@/lib/twilio-backup.server");
        const { lineTokenFor } = await import("@/lib/twilio-lines.server");
        const token = await lineTokenFor(params.get("AccountSid") ?? "");
        if (!verifyTwilioSignature(twilioStatusUrl(), params, request.headers.get("x-twilio-signature"), token)) {
          return new Response("Invalid signature", { status: 401 });
        }
        const id = params.get("MessageSid") ?? "";
        const { mapTwilioStatus, isTwilioMessageId } = await import("@/lib/twilio-backup-routing");
        const status = mapTwilioStatus(params.get("MessageStatus") ?? undefined);
        if (!isTwilioMessageId(id) || !status) return new Response("ok");
        const code = params.get("ErrorCode");
        const errors = status === "delivery_failed"
          ? [{ code: code ? `TW${code}` : "TW_FAILED", detail: "Recipient network did not deliver the message." }]
          : [];
        const { handleStatus } = await import("@/routes/api.public.telnyx-status");
        await handleStatus({
          data: {
            event_type: status === "sent" ? "message.sent" : "message.finalized",
            payload: { id, to: [{ status, errors }] },
          },
        });
        return new Response("ok");
      },
    },
  },
});
