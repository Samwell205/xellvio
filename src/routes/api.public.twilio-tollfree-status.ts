import { createFileRoute } from "@tanstack/react-router";
import { createHash, createHmac, timingSafeEqual } from "crypto";

const MESSAGING_API = "https://messaging.twilio.com/v1";

function basic(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function mapStatus(raw: string | undefined): "submitted" | "in_review" | "verified" | "rejected" {
  const t = (raw ?? "").toUpperCase();
  if (t === "APPROVED" || t === "TWILIO_APPROVED") return "verified";
  if (t === "REJECTED" || t === "TWILIO_REJECTED") return "rejected";
  if (t === "IN_REVIEW") return "in_review";
  return "submitted";
}

function friendlyReason(raw: string | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (!t) return "The carrier hasn't returned a specific reason yet.";
  if (t.includes("privacy")) return "Your website needs a visible Privacy Policy link.";
  if (t.includes("terms")) return "Your website needs a visible Terms of Service link.";
  if (t.includes("opt") || t.includes("consent"))
    return "The carrier received the opt-in proof, but it did not clearly match the submitted SMS use case. Resubmit proof that visibly shows your business name, phone field or SMS sign-up form, an optional/unchecked SMS opt-in checkbox, message purpose, Msg & data rates may apply, Reply STOP to opt out, HELP for help, and Privacy/Terms links.";
  if (t.includes("sample") || t.includes("message"))
    return "Your sample message needs revision so it matches what carriers expect.";
  if (t.includes("website") || t.includes("url"))
    return "Your business website couldn't be reached. Double-check the URL.";
  if (t.includes("address")) return "The business address couldn't be verified. Check it for typos.";
  if (t.includes("name") || t.includes("entity"))
    return "The legal business name doesn't match a verifiable registration.";
  return raw!;
}

/**
 * Verify Twilio's X-Twilio-Signature header.
 * Twilio computes: HMAC-SHA1(authToken, fullUrl + sortedFormParamsConcatenated)
 * and base64-encodes it. For JSON payloads, it uses HMAC-SHA256 of the raw body
 * and puts it in X-Twilio-Signature after the URL prefix, but the reliable form
 * is: SHA1(url + sortedForm) — we support the classic form signature which is
 * what Messaging status callbacks send.
 */
function verifyTwilioSignature(opts: {
  authToken: string;
  signature: string | null;
  url: string;
  form: URLSearchParams | null;
  rawBody: string;
}): boolean {
  if (!opts.signature) return false;
  // Classic (form-encoded) signature
  if (opts.form) {
    const keys = Array.from(opts.form.keys()).sort();
    let payload = opts.url;
    for (const k of keys) payload += k + (opts.form.get(k) ?? "");
    const expected = createHmac("sha1", opts.authToken).update(payload).digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(opts.signature);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  // JSON body signature: sha256(url + rawBody), base64
  const expectedJson = createHmac("sha256", opts.authToken)
    .update(opts.url + opts.rawBody)
    .digest("base64");
  const aj = Buffer.from(expectedJson);
  const bj = Buffer.from(opts.signature);
  return aj.length === bj.length && timingSafeEqual(aj, bj);
}

export const Route = createFileRoute("/api/public/twilio-tollfree-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const signature = request.headers.get("x-twilio-signature");
        const ctype = request.headers.get("content-type") ?? "";
        const rawBody = await request.text();

        // Reconstruct full URL as Twilio saw it — respect x-forwarded-proto/host
        // because we run behind a proxy.
        const proto = request.headers.get("x-forwarded-proto") ?? "https";
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
        const pathAndQuery = new URL(request.url).pathname + new URL(request.url).search;
        const fullUrl = `${proto}://${host}${pathAndQuery}`;

        let form: URLSearchParams | null = null;
        let payload: any = null;
        try {
          if (ctype.includes("application/json")) {
            payload = rawBody ? JSON.parse(rawBody) : {};
          } else {
            form = new URLSearchParams(rawBody);
            payload = Object.fromEntries(form.entries());
          }
        } catch {
          return new Response("bad body", { status: 400 });
        }

        // 1) Signature verification (skip only if TWILIO_AUTH_TOKEN missing — dev only).
        if (authToken) {
          const ok = verifyTwilioSignature({ authToken, signature, url: fullUrl, form, rawBody });
          if (!ok) {
            console.warn("[twilio-tollfree-status] signature verification failed", { url: fullUrl });
            return new Response("invalid signature", { status: 403 });
          }
        }

        const verificationSid: string | null =
          payload?.tollfree_verification_sid ??
          payload?.TollfreeVerificationSid ??
          payload?.VerificationSid ??
          payload?.sid ??
          payload?.Sid ??
          null;
        const statusHint: string | undefined = payload?.status ?? payload?.Status;
        const reasonHint: string | undefined = Array.isArray(payload?.rejection_reason)
          ? payload.rejection_reason.join("; ")
          : payload?.rejection_reason ?? payload?.RejectionReason;

        if (!verificationSid) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 2) Idempotency — dedupe on a stable hash of the raw body.
        const bodyHash = createHash("sha256")
          .update(`${verificationSid}|${statusHint ?? ""}|${rawBody}`)
          .digest("hex");
        const { error: dupErr } = await supabaseAdmin
          .from("twilio_webhook_events")
          .insert({ body_hash: bodyHash, verification_sid: verificationSid, status: statusHint ?? null });
        if (dupErr && (dupErr as any).code === "23505") {
          // already processed — ack silently
          return new Response("ok");
        }

        const { data: asset } = await supabaseAdmin
          .from("sender_assets")
          .select("id,account_id")
          .eq("verification_sid", verificationSid)
          .maybeSingle();

        const { data: verifierTfn } = await supabaseAdmin
          .from("verifier_tfns")
          .select("id")
          .eq("twilio_verification_sid", verificationSid)
          .maybeSingle();

        if (!asset && !verifierTfn) return new Response("ok");

        // Re-fetch authoritative status from Twilio.
        let status = mapStatus(statusHint);
        let reason: string | null = status === "rejected" ? (reasonHint ?? "rejected") : null;
        try {
          const { decryptToken } = await import("@/lib/tenant-crypto.server");
          const { data: acct } = asset
            ? await supabaseAdmin
                .from("accounts")
                .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
                .eq("id", asset.account_id)
                .maybeSingle()
            : { data: null as any };
          let subSid = acct?.twilio_subaccount_sid ?? null;
          let subToken: string | null = null;
          if (subSid && acct?.twilio_subaccount_auth_token_enc) {
            try {
              subToken = decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string);
            } catch {
              subToken = null;
            }
          }
          if (!subSid || !subToken) {
            subSid = process.env.TWILIO_ACCOUNT_SID ?? null;
            subToken = process.env.TWILIO_AUTH_TOKEN ?? null;
          }
          if (subSid && subToken) {
            const res = await fetch(`${MESSAGING_API}/Tollfree/Verifications/${verificationSid}`, {
              headers: { Authorization: basic(subSid, subToken) },
            });
            if (res.ok) {
              const ver: any = await res.json();
              status = mapStatus(ver.status);
              if (status === "rejected") {
                reason = Array.isArray(ver.rejection_reason)
                  ? ver.rejection_reason.join("; ")
                  : ver.rejection_reason ?? ver.errors?.[0]?.description ?? reason ?? "rejected";
              } else {
                reason = null;
              }
            }
          }
        } catch {
          /* fall back to hints */
        }

        const nowIso = new Date().toISOString();

        if (asset) {
          const patch: any = {
            verification_status: status,
            rejection_reason: reason,
            friendly_rejection_reason: reason ? friendlyReason(reason) : null,
            last_synced_at: nowIso,
          };
          if (status === "submitted") patch.submitted_at = nowIso;
          if (status === "in_review") patch.in_review_at = nowIso;
          if (status === "verified") patch.verified_at = nowIso;
          if (status === "rejected") patch.rejected_at = nowIso;
          await supabaseAdmin.from("sender_assets").update(patch).eq("id", asset.id);

          if (status === "verified") {
            await supabaseAdmin
              .from("accounts")
              .update({ onboarding_status: "active" })
              .eq("id", asset.account_id);
          }

          if (status === "verified" || status === "rejected") {
            try {
              const { data: acct } = await supabaseAdmin
                .from("accounts")
                .select("contact_email,email,full_name,legal_business_name")
                .eq("id", asset.account_id)
                .maybeSingle();
              const { data: assetFull } = await supabaseAdmin
                .from("sender_assets")
                .select("phone_number")
                .eq("id", asset.id)
                .maybeSingle();
              const recipient = (acct?.contact_email || acct?.email || "").trim();
              if (recipient) {
                const firstName = (acct?.full_name ?? "").split(" ")[0] || undefined;
                const baseUrl = process.env.PUBLIC_BASE_URL ?? "https://xellvio.lovable.app";
                const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
                if (status === "verified") {
                  await sendBrandedEmail({
                    templateName: "tollfree-approved",
                    recipientEmail: recipient,
                    idempotencyKey: `tfv-${verificationSid}-approved`,
                    templateData: {
                      firstName,
                      businessName: acct?.legal_business_name ?? undefined,
                      phoneNumber: assetFull?.phone_number ?? undefined,
                      dashboardUrl: `${baseUrl}/app/campaigns/new`,
                    },
                  });
                } else {
                  await sendBrandedEmail({
                    templateName: "tollfree-rejected",
                    recipientEmail: recipient,
                    idempotencyKey: `tfv-${verificationSid}-rejected`,
                    templateData: {
                      firstName,
                      businessName: acct?.legal_business_name ?? undefined,
                      phoneNumber: assetFull?.phone_number ?? undefined,
                      reason: reason ? friendlyReason(reason) : undefined,
                      setupUrl: `${baseUrl}/app/setup-sms`,
                    },
                  });
                }
              }
            } catch (err) {
              console.warn("[twilio-tollfree-status] branded email failed", err);
            }
          }
        }

        if (verifierTfn) {
          const dbStatus =
            status === "verified" ? "verified" :
            status === "rejected" ? "rejected" : "pending_verification";
          const patch: any = { status: dbStatus, rejection_reason: reason };
          if (status === "submitted") patch.submitted_at = nowIso;
          if (status === "in_review") patch.in_review_at = nowIso;
          if (status === "verified") patch.verified_at = nowIso;
          if (status === "rejected") patch.rejected_at = nowIso;
          await supabaseAdmin.from("verifier_tfns").update(patch).eq("id", verifierTfn.id);
        }

        return new Response("ok");
      },
    },
  },
});
