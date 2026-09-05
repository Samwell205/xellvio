// Telnyx inbound-message webhook. Replaces api.public.twilio-inbound.
// Telnyx delivers inbound SMS as event_type = "message.received".

import { createFileRoute } from "@tanstack/react-router";
import { verify as verifyEd25519 } from "crypto";

function verifyTelnyxSignature(rawBody: string, signature: string | null, timestamp: string | null, publicKeyBase64: string): boolean {
  if (!signature || !timestamp) return false;
  try {
    const payload = `${timestamp}|${rawBody}`;
    const rawKey = Buffer.from(publicKeyBase64, "base64");
    if (rawKey.length !== 32) return false;
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]);
    const sigBuf = Buffer.from(signature, "base64");
    return verifyEd25519(null, Buffer.from(payload), { key: der, format: "der", type: "spki" }, sigBuf);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/telnyx-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("telnyx-signature-ed25519");
        const ts = request.headers.get("telnyx-timestamp");
        const pub = process.env.TELNYX_PUBLIC_KEY;

        // Fail closed: without the signing key we cannot tell a real carrier
        // webhook from a forged one, so nothing is processed.
        if (!pub) {
          console.error("[telnyx-inbound] TELNYX_PUBLIC_KEY not set — rejecting webhook");
          return new Response("Webhook verification unavailable", { status: 401 });
        }
        if (!verifyTelnyxSignature(raw, sig, ts, pub)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response("bad body", { status: 400 });
        }
        const { handleTelnyxInboundMessage } = await import("@/lib/telnyx-inbound-routing.server");
        await handleTelnyxInboundMessage(payload);

        return new Response("ok");
      },
    },
  },
});
