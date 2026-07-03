// Telnyx inbound-message webhook. Replaces api.public.twilio-inbound.
// Telnyx delivers inbound SMS as event_type = "message.received".

import { createFileRoute } from "@tanstack/react-router";
import { verify as verifyEd25519 } from "crypto";

const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPALL"];
const RESUB_WORDS = ["START", "UNSTOP", "YES"];

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

        if (pub && !verifyTelnyxSignature(raw, sig, ts, pub)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response("bad body", { status: 400 });
        }
        const p = payload?.data?.payload ?? {};
        const from: string | undefined = p?.from?.phone_number;
        const to: string | undefined = Array.isArray(p?.to) ? p.to[0]?.phone_number : undefined;
        const bodyText: string = (p?.text ?? "").trim();
        const providerSid: string | null = p?.id ?? null;

        if (!from) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look up account(s) that own the destination number.
        const accountIds = new Set<string>();
        if (to) {
          const { data: assets } = await supabaseAdmin
            .from("sender_assets").select("account_id").eq("phone_number", to);
          for (const a of assets ?? []) accountIds.add(a.account_id);
          const { data: numRows } = await supabaseAdmin
            .from("numbers").select("account_id").eq("phone_number", to);
          for (const n of numRows ?? []) accountIds.add(n.account_id);
        }

        const { data: profiles } = await supabaseAdmin
          .from("profiles").select("id, account_id").eq("phone_e164", from);
        for (const pr of profiles ?? []) accountIds.add(pr.account_id);

        const upper = bodyText.toUpperCase();
        if (STOP_WORDS.includes(upper)) {
          for (const pr of profiles ?? []) {
            await supabaseAdmin.from("consents").upsert({
              profile_id: pr.id, channel: "sms", status: "unsubscribed",
              source: "inbound_stop", consented_at: new Date().toISOString(),
            }, { onConflict: "profile_id,channel" });
            await supabaseAdmin.from("suppressions").upsert({
              account_id: pr.account_id, phone_e164: from,
              reason: "inbound_stop", source: "telnyx_inbound",
            }, { onConflict: "account_id,phone_e164" });
          }
        } else if (RESUB_WORDS.includes(upper)) {
          for (const pr of profiles ?? []) {
            await supabaseAdmin.from("consents").upsert({
              profile_id: pr.id, channel: "sms", status: "subscribed",
              source: "inbound_start", consented_at: new Date().toISOString(),
            }, { onConflict: "profile_id,channel" });
            await supabaseAdmin.from("suppressions").delete()
              .eq("account_id", pr.account_id).eq("phone_e164", from);
          }
        }

        if (bodyText && accountIds.size > 0) {
          await supabaseAdmin.from("sms_thread_messages").insert(
            Array.from(accountIds).map((account_id) => ({
              account_id,
              phone_e164: from,
              direction: "inbound" as const,
              body: bodyText,
              from_number: from,
              to_number: to ?? null,
              provider_sid: providerSid,
              status: "received",
            })),
          );
          try {
            const { forwardSmsToGorgias } = await import("@/lib/gorgias.server");
            await Promise.all(
              Array.from(accountIds).map((accountId) =>
                forwardSmsToGorgias({
                  accountId,
                  phone: from,
                  fromNumber: to ?? null,
                  body: bodyText,
                  direction: "inbound",
                }),
              ),
            );
          } catch { /* best effort */ }
        }

        return new Response("ok");
      },
    },
  },
});
