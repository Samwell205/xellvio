import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPALL"];
const RESUB_WORDS = ["START", "UNSTOP", "YES"];

function validateTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string) {
  const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  const data = url + sorted;
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

function twiml(body?: string) {
  const inner = body ? `<Message>${body}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/twilio-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken) return new Response("Not configured", { status: 500 });

        const url = new URL(request.url);
        const publicUrl = `${url.origin}${url.pathname}`;
        const form = await request.formData();
        const params: Record<string, string> = {};
        form.forEach((v, k) => { params[k] = String(v); });

        const from = params.From;
        const to = params.To;
        const text = (params.Body ?? "").trim().toUpperCase();
        if (!from) return twiml();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sig = request.headers.get("x-twilio-signature") ?? "";
        let valid = validateTwilioSignature(authToken, publicUrl, params, sig);
        if (!valid && to) {
          const { data: asset } = await supabaseAdmin
            .from("sender_assets")
            .select("account_id")
            .eq("phone_number", to)
            .maybeSingle();
          if (asset?.account_id) {
            const { data: acct } = await supabaseAdmin
              .from("accounts")
              .select("twilio_subaccount_auth_token_enc")
              .eq("id", asset.account_id)
              .maybeSingle();
            if (acct?.twilio_subaccount_auth_token_enc) {
              const { decryptToken } = await import("@/lib/tenant-crypto.server");
              valid = validateTwilioSignature(decryptToken(acct.twilio_subaccount_auth_token_enc as unknown as string), publicUrl, params, sig);
            }
          }
        }
        if (!valid) return new Response("Invalid signature", { status: 401 });

        // Find profile(s) by phone — match across accounts (Twilio number is global)
        const { data: profiles } = await supabaseAdmin
          .from("profiles").select("id, account_id").eq("phone_e164", from);

        if (STOP_WORDS.includes(text)) {
          for (const p of profiles ?? []) {
            await supabaseAdmin.from("consents").upsert({
              profile_id: p.id, channel: "sms", status: "unsubscribed",
              source: "inbound_stop", consented_at: new Date().toISOString(),
            }, { onConflict: "profile_id,channel" });
            await supabaseAdmin.from("suppressions").upsert({
              account_id: p.account_id, phone_e164: from,
              reason: "inbound_stop", source: "twilio_inbound",
            }, { onConflict: "account_id,phone_e164" });
          }
          return twiml("You're unsubscribed. Reply START to opt back in.");
        }

        if (RESUB_WORDS.includes(text)) {
          for (const p of profiles ?? []) {
            await supabaseAdmin.from("consents").upsert({
              profile_id: p.id, channel: "sms", status: "subscribed",
              source: "inbound_start", consented_at: new Date().toISOString(),
            }, { onConflict: "profile_id,channel" });
            await supabaseAdmin.from("suppressions").delete()
              .eq("account_id", p.account_id).eq("phone_e164", from);
          }
          return twiml("You're resubscribed. Reply STOP to opt out.");
        }

        return twiml();
      },
    },
  },
});
