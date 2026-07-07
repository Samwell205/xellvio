// Telnyx webhook — handles BOTH delivery events and inbound messages.
// Telnyx delivers every event for a Messaging Profile to the same Webhook URL,
// differentiated by data.event_type:
//   message.sent            → provider accepted
//   message.finalized       → terminal (delivered / delivery_failed / sending_failed)
//   message.received        → inbound SMS from a subscriber
//
// Point BOTH "Webhook URL" and "Webhook Failover URL" in the Telnyx portal at
// this endpoint. Signatures are verified with TELNYX_PUBLIC_KEY (Ed25519).

import { createFileRoute } from "@tanstack/react-router";
import { verify as verifyEd25519 } from "crypto";

const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPALL"];
const RESUB_WORDS = ["START", "UNSTOP", "YES"];

function mapVerificationStatus(raw: string | null | undefined): "submitted" | "in_review" | "verified" | "rejected" {
  const value = (raw ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (value.includes("verified") || value.includes("approved")) return "verified";
  if (value.includes("rejected") || value.includes("denied") || value.includes("cancelled") || value.includes("canceled")) return "rejected";
  if (value.includes("review") || value.includes("progress") || value.includes("pending") || value.includes("waiting")) return "in_review";
  return "submitted";
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

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

async function handleInbound(payload: any) {
  const p = payload?.data?.payload ?? {};
  const from: string | undefined = p?.from?.phone_number;
  const to: string | undefined = Array.isArray(p?.to) ? p.to[0]?.phone_number : undefined;
  const bodyText: string = (p?.text ?? "").trim();
  const providerSid: string | null = p?.id ?? null;
  if (!from) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
}

async function handleStatus(payload: any) {
  const evtType: string = payload?.data?.event_type ?? "";
  const p = payload?.data?.payload ?? {};
  const providerId: string | null = p?.id ?? null;
  if (!providerId) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { mapTelnyxStatus } = await import("@/lib/telnyx.server");

  const first = Array.isArray(p?.to) ? p.to[0] : null;
  const rawStatus: string = first?.status ?? p?.status ?? evtType.split(".")[1] ?? "";
  const errCode = first?.errors?.[0]?.code ?? p?.errors?.[0]?.code ?? null;

  const status = mapTelnyxStatus(rawStatus);
  const update: any = { status };
  if (status === "delivered") update.delivered_at = new Date().toISOString();
  if (errCode) update.error_code = String(errCode);
  if (status === "sent" && errCode) update.status = "undelivered";

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("provider_message_id", providerId)
    .maybeSingle();
  if (!msg) return;
  await supabaseAdmin.from("messages").update(update).eq("id", msg.id);
  await supabaseAdmin
    .from("events")
    .insert({ message_id: msg.id, type: `status:${status}`, payload });
}

async function handleTollfreeVerification(payload: any): Promise<boolean> {
  const evtType: string = payload?.data?.event_type ?? "";
  const p = payload?.data?.payload ?? payload?.data ?? {};
  const isVerificationEvent =
    evtType.toLowerCase().includes("verification") ||
    typeof p?.verificationStatus === "string" ||
    Array.isArray(p?.phoneNumbers);
  if (!isVerificationEvent) return false;

  const verificationId: string | null = pickText(p?.id, p?.verification_id, p?.verificationSid);
  if (!verificationId) return true;

  const rawStatus = pickText(p?.verificationStatus, p?.verification_status, p?.status, p?.requestStatus, p?.request_status);
  const reason = pickText(
    p?.reason,
    p?.rejectionReason,
    p?.rejection_reason,
    p?.statusReason,
    p?.status_reason,
    p?.customerMessage,
    p?.customer_message,
  );
  const status = mapVerificationStatus(rawStatus);
  const nowIso = new Date().toISOString();
  const assetPatch: any = {
    verification_status: status,
    rejection_reason: reason,
    friendly_rejection_reason: reason,
    last_synced_at: nowIso,
  };
  if (status === "in_review") assetPatch.in_review_at = nowIso;
  if (status === "verified") {
    assetPatch.verified_at = nowIso;
    assetPatch.rejected_at = null;
  }
  if (status === "rejected") assetPatch.rejected_at = nowIso;

  const verifierStatus = status === "verified" ? "verified" : status === "rejected" ? "rejected" : "pending_verification";
  const verifierPatch: any = { status: verifierStatus, rejection_reason: reason };
  if (status === "in_review") verifierPatch.in_review_at = nowIso;
  if (verifierStatus === "verified") verifierPatch.verified_at = nowIso;
  if (verifierStatus === "rejected") verifierPatch.rejected_at = nowIso;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await Promise.all([
    supabaseAdmin.from("sender_assets").update(assetPatch).eq("telnyx_verification_id", verificationId),
    supabaseAdmin.from("verifier_tfns").update(verifierPatch).eq("telnyx_verification_id", verificationId),
  ]);
  return true;
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
          console.warn("[telnyx-webhook] TELNYX_PUBLIC_KEY not set — skipping signature check");
        }

        let payload: any = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response("bad body", { status: 400 });
        }

        const evtType: string = payload?.data?.event_type ?? "";
        try {
          if (evtType === "message.received") {
            await handleInbound(payload);
          } else if (await handleTollfreeVerification(payload)) {
            // Toll-free verification status/reason was saved above.
          } else {
            await handleStatus(payload);
          }
        } catch (err) {
          console.error("[telnyx-webhook] handler error", { evtType, err });
          return new Response("error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
