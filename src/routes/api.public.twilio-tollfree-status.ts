import { createFileRoute } from "@tanstack/react-router";

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

export const Route = createFileRoute("/api/public/twilio-tollfree-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let verificationSid: string | null = null;
        let statusHint: string | undefined;
        let reasonHint: string | undefined;
        const ctype = request.headers.get("content-type") ?? "";
        try {
          if (ctype.includes("application/json")) {
            const j: any = await request.json();
            verificationSid =
              j?.tollfree_verification_sid ?? j?.TollfreeVerificationSid ?? j?.sid ?? j?.Sid ?? null;
            statusHint = j?.status ?? j?.Status;
            reasonHint = Array.isArray(j?.rejection_reason)
              ? j.rejection_reason.join("; ")
              : j?.rejection_reason ?? j?.RejectionReason;
          } else {
            const form = await request.formData();
            const get = (k: string) => {
              const v = form.get(k);
              return typeof v === "string" ? v : null;
            };
            verificationSid =
              get("TollfreeVerificationSid") ?? get("VerificationSid") ?? get("Sid");
            statusHint = get("Status") ?? undefined;
            reasonHint = get("RejectionReason") ?? undefined;
          }
        } catch {
          // ignore parse errors
        }

        if (!verificationSid) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: asset } = await supabaseAdmin
          .from("sender_assets")
          .select("id,account_id")
          .eq("verification_sid", verificationSid)
          .maybeSingle();
        if (!asset) return new Response("ok");

        // Re-fetch from Twilio to get the authoritative status + reason.
        let status = mapStatus(statusHint);
        let reason: string | null =
          status === "rejected" ? (reasonHint ?? "rejected") : null;

        try {
          const { decryptToken } = await import("@/lib/tenant-crypto.server");
          const { data: acct } = await supabaseAdmin
            .from("accounts")
            .select("twilio_subaccount_sid,twilio_subaccount_auth_token_enc")
            .eq("id", asset.account_id)
            .maybeSingle();
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
          // fall back to hints from the webhook body
        }

        await supabaseAdmin
          .from("sender_assets")
          .update({
            verification_status: status,
            rejection_reason: reason,
            friendly_rejection_reason: reason ? friendlyReason(reason) : null,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", asset.id);

        if (status === "verified") {
          await supabaseAdmin
            .from("accounts")
            .update({ onboarding_status: "active" })
            .eq("id", asset.account_id);
        }

        // Send branded status email to the customer (approved / rejected).
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
              const baseUrl =
                process.env.PUBLIC_BASE_URL ?? "https://xellvio.lovable.app";
              const { sendBrandedEmail } = await import(
                "@/lib/email/send-internal.server"
              );
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

        return new Response("ok");
      },
    },
  },
});
