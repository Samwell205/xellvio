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

        const sig = request.headers.get("x-twilio-signature") ?? "";
        if (!validateTwilioSignature(authToken, publicUrl, params, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const sid = params.MessageSid;
        const status = (params.MessageStatus ?? "").toLowerCase();
        const errorCode = params.ErrorCode || null;
        if (!sid) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotent: find the message by provider id
        const { data: msg } = await supabaseAdmin
          .from("messages").select("id").eq("provider_message_id", sid).maybeSingle();
        if (!msg) return new Response("ok"); // unknown — ignore

        const update: Record<string, any> = { status };
        if (status === "delivered") update.delivered_at = new Date().toISOString();
        if (errorCode) update.error_code = errorCode;
        await supabaseAdmin.from("messages").update(update).eq("id", msg.id);
        await supabaseAdmin.from("events").insert({ message_id: msg.id, type: `status:${status}`, payload: params });

        return new Response("ok");
      },
    },
  },
});
