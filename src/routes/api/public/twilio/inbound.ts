// Inbound texts (incl. STOP) to a business's dedicated toll-free line.
// Signature-verified with that line's own token, then handed to the shared
// inbound handler so opt-outs and the inbox behave identically.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URLSearchParams(await request.text());
        const { lineTokenFor, lineWebhookBase } = await import("@/lib/twilio-lines.server");
        const { verifyTwilioSignature } = await import("@/lib/twilio-backup.server");
        const token = await lineTokenFor(params.get("AccountSid") ?? "");
        if (!verifyTwilioSignature(`${lineWebhookBase()}/inbound`, params, request.headers.get("x-twilio-signature"), token)) {
          return new Response("Invalid signature", { status: 401 });
        }
        const from = params.get("From") ?? "";
        const to = params.get("To") ?? "";
        if (!/^\+\d{6,15}$/.test(from) || !/^\+\d{6,15}$/.test(to)) return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
        const { handleTelnyxInboundMessage } = await import("@/lib/telnyx-inbound-routing.server");
        await handleTelnyxInboundMessage({
          data: {
            occurred_at: new Date().toISOString(),
            payload: {
              id: params.get("MessageSid"),
              from: { phone_number: from },
              to: [{ phone_number: to }],
              text: String(params.get("Body") ?? "").slice(0, 1600),
            },
          },
        });
        return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
      },
    },
  },
});
