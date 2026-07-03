// Telnyx delivery-status webhook. Replaces api.public.twilio-status.
// Telnyx delivers events at Messaging Profile level with these types:
//   message.sent            → provider accepted
//   message.finalized       → terminal state; each entry in `data.payload.to[]`
//                             carries a `status` field: delivered / delivery_failed
//                             / sending_failed / delivery_unconfirmed
//
// We verify signatures with the Telnyx Ed25519 public key. If TELNYX_PUBLIC_KEY
// is not configured we log a warning and still process (dev-only fallback).

import { createFileRoute } from "@tanstack/react-router";
import { verify as verifyEd25519 } from "crypto";

function verifyTelnyxSignature(rawBody: string, signature: string | null, timestamp: string | null, publicKeyBase64: string): boolean {
  if (!signature || !timestamp) return false;
  try {
    const payload = `${timestamp}|${rawBody}`;
    // Telnyx public key comes as base64 of the 32-byte Ed25519 public key.
    const rawKey = Buffer.from(publicKeyBase64, "base64");
    if (rawKey.length !== 32) return false;
    // Build DER SubjectPublicKeyInfo for Ed25519: 302a300506032b6570032100 || rawKey
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]);
    const sigBuf = Buffer.from(signature, "base64");
    return verifyEd25519(null, Buffer.from(payload), { key: der, format: "der", type: "spki" }, sigBuf);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/telnyx-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("telnyx-signature-ed25519");
        const ts = request.headers.get("telnyx-timestamp");
        const pub = process.env.TELNYX_PUBLIC_KEY;

        if (pub) {
          if (!verifyTelnyxSignature(raw, sig, ts, pub)) {
            return new Response("Invalid signature", { status: 401 });
          }
        } else {
          console.warn("[telnyx-status] TELNYX_PUBLIC_KEY not set — skipping signature check");
        }

        let payload: any = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response("bad body", { status: 400 });
        }

        const evtType: string = payload?.data?.event_type ?? "";
        const p = payload?.data?.payload ?? {};
        const providerId: string | null = p?.id ?? null;
        if (!providerId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { mapTelnyxStatus } = await import("@/lib/telnyx.server");

        // Determine terminal per-recipient status. Telnyx `to[]` array carries
        // per-recipient status; for single-recipient messages we take [0].
        const first = Array.isArray(p?.to) ? p.to[0] : null;
        const rawStatus: string = first?.status ?? p?.status ?? evtType.split(".")[1] ?? "";
        const errCode = first?.errors?.[0]?.code ?? p?.errors?.[0]?.code ?? null;

        const status = mapTelnyxStatus(rawStatus);
        const update: any = { status };
        if (status === "delivered") update.delivered_at = new Date().toISOString();
        if (errCode) update.error_code = String(errCode);
        // Guard: Telnyx reports "sent" with an error → treat as undelivered.
        if (status === "sent" && errCode) update.status = "undelivered";

        const { data: msg } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("provider_message_id", providerId)
          .maybeSingle();
        if (!msg) return new Response("ok"); // unknown provider id
        await supabaseAdmin.from("messages").update(update).eq("id", msg.id);
        await supabaseAdmin
          .from("events")
          .insert({ message_id: msg.id, type: `status:${status}`, payload });
        return new Response("ok");
      },
    },
  },
});
