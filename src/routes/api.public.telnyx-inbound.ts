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

        // Determine the ONE correct tenant for this reply. A single toll-free
        // or shared number can be routed to multiple tenants (pool/marketplace),
        // so we cannot just insert for every account that owns the number.
        // Resolution order:
        //   1) The tenant whose most recent outbound message to this `from`
        //      phone came from this exact `to` number → definitive owner of
        //      the conversation.
        //   2) The tenant whose most recent outbound message to `from` was
        //      via ANY of their numbers (covers cases where the reply comes
        //      back on a different but shared line).
        //   3) Fallback: the sole owner of the destination number, if it is
        //      not shared. If it IS shared and steps 1–2 found nothing, drop
        //      the message rather than fan it out to every tenant.
        const accountIds = new Set<string>();

        // Look up all tenants that OWN this destination number.
        const numberOwners = new Set<string>();
        if (to) {
          const { data: assets } = await supabaseAdmin
            .from("sender_assets").select("account_id").eq("phone_number", to);
          for (const a of assets ?? []) numberOwners.add(a.account_id);
          const { data: numRows } = await supabaseAdmin
            .from("numbers").select("account_id").eq("phone_number", to);
          for (const n of numRows ?? []) numberOwners.add(n.account_id);
        }

        // Step 1 + 2: most-recent outbound sender to this contact.
        // messages doesn't have account_id directly — join through campaigns.
        const { data: recentOut } = await supabaseAdmin
          .from("messages")
          .select("created_at, campaigns!inner(account_id)")
          .eq("phone_e164", from)
          .in("status", ["sent", "delivered", "queued", "delivery_unconfirmed"])
          .order("created_at", { ascending: false })
          .limit(20);
        const recentAccountIds = ((recentOut ?? []) as any[])
          .map((r) => r.campaigns?.account_id)
          .filter((x: string | undefined): x is string => !!x);
        // Also check thread-level outbound (previous inbox replies).
        const { data: recentThread } = await supabaseAdmin
          .from("sms_thread_messages")
          .select("account_id, to_number, created_at")
          .eq("phone_e164", from)
          .eq("direction", "outbound")
          .order("created_at", { ascending: false })
          .limit(20);
        const threadAccountIds = (recentThread ?? []).map((r) => r.account_id).filter(Boolean);

        // First pass: prefer a match that ALSO owns the destination number.
        const combined = [...recentAccountIds, ...threadAccountIds];
        const withOwnership = combined.find((id) => numberOwners.size === 0 || numberOwners.has(id));
        if (withOwnership) {
          accountIds.add(withOwnership);
        } else if (numberOwners.size === 1) {
          // Fallback: dedicated (non-shared) number → the single owner.
          accountIds.add(Array.from(numberOwners)[0]);
        }
        // If number is shared and no recent outbound match, we deliberately
        // do not fan out to every tenant. Consent (STOP/START) still runs
        // per-profile below so opt-outs are respected on each side.

        const { data: profiles } = await supabaseAdmin
          .from("profiles").select("id, account_id").eq("phone_e164", from);


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
