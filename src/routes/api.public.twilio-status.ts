import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function validateTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string) {
  // Per Twilio: sort params alphabetically, concat key+value, prepend URL, HMAC-SHA1, base64
  const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  const data = url + sorted;
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

export const Route = createFileRoute("/api/public/twilio-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken) return new Response("Not configured", { status: 500 });

        const url = new URL(request.url);
        // For signature, Twilio uses the full URL it called
        const publicUrl = `${url.origin}${url.pathname}`;
        const form = await request.formData();
        const params: Record<string, string> = {};
        form.forEach((v, k) => { params[k] = String(v); });

        const sid = params.MessageSid;
        const status = (params.MessageStatus ?? "").toLowerCase();
        const errorCode = params.ErrorCode || null;
        if (!sid) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sig = request.headers.get("x-twilio-signature") ?? "";
        const masterValid = validateTwilioSignature(authToken, publicUrl, params, sig);

        // Idempotent: find the message by provider id
        const { data: msg } = await supabaseAdmin
          .from("messages").select("id, campaign:campaign_id(account_id)").eq("provider_message_id", sid).maybeSingle();
        if (!msg) return new Response("ok"); // unknown — ignore

        let valid = masterValid;
        if (!valid) {
          const accountId = Array.isArray(msg.campaign) ? msg.campaign[0]?.account_id : msg.campaign?.account_id;
          if (accountId) {
            const { data: acct } = await supabaseAdmin
              .from("accounts")
              .select("twilio_subaccount_auth_token_enc")
              .eq("id", accountId)
              .maybeSingle();
            if (acct?.twilio_subaccount_auth_token_enc) {
              const { decryptToken } = await import("@/lib/tenant-crypto.server");
              valid = validateTwilioSignature(decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string), publicUrl, params, sig);
            }
          }
        }
        if (!valid) return new Response("Invalid signature", { status: 401 });

        // If Twilio reports "sent" but attaches an ErrorCode, the carrier
        // rejected it — treat as undelivered so it doesn't inflate Sent counts.
        const effectiveStatus = status === "sent" && errorCode ? "undelivered" : status;
        const update: { status: string; delivered_at?: string; error_code?: string } = { status: effectiveStatus };
        if (effectiveStatus === "delivered") update.delivered_at = new Date().toISOString();
        if (errorCode) update.error_code = errorCode;
        await supabaseAdmin.from("messages").update(update).eq("id", msg.id);

        await supabaseAdmin.from("events").insert({ message_id: msg.id, type: `status:${status}`, payload: params });

        return new Response("ok");
      },
    },
  },
});
