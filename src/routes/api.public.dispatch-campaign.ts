import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const BATCH_SIZE = 500;

function render(body: string, p: { first_name?: string | null; last_name?: string | null }) {
  return body
    .replaceAll("{{first_name}}", p.first_name ?? "")
    .replaceAll("{{last_name}}", p.last_name ?? "");
}

async function statusCallbackUrl(): Promise<string> {
  // Stable preview URL — Twilio statusCallback target. Use production if you publish.
  const base = process.env.PUBLIC_BASE_URL
    ?? "https://samwell-reach-global.lovable.app";
  return `${base}/api/public/twilio-status`;
}

async function dispatchOne(
  supabaseAdmin: any,
  campaign: any,
  twilio: { lovableKey: string; twilioKey: string; messagingService: string },
): Promise<{ queued: number; failed: number }> {
  // Mark sending
  await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign.id);

  const { data: recipients, error } = await supabaseAdmin.rpc("eligible_profile_ids", {
    _account_id: campaign.account_id,
    _audience: campaign.audience ?? { include: [], exclude: [] },
  });
  if (error) throw error;

  const list = (recipients ?? []) as any[];
  const callback = await statusCallbackUrl();
  let queued = 0;
  let failed = 0;

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);

    // Pre-insert message rows as queued
    const rows = batch.map((p) => ({
      campaign_id: campaign.id,
      profile_id: p.profile_id,
      phone_e164: p.phone_e164,
      rendered_body: render(campaign.message_body, p),
      status: "queued",
    }));
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("messages").insert(rows).select("id, phone_e164, rendered_body");
    if (insErr) { failed += rows.length; continue; }

    // Fire to Twilio in parallel (bounded)
    await Promise.all((inserted ?? []).map(async (m: any) => {
      try {
        const body = new URLSearchParams({
          To: m.phone_e164,
          MessagingServiceSid: twilio.messagingService,
          Body: m.rendered_body,
          StatusCallback: callback,
        });
        if (campaign.media_url) body.append("MediaUrl", campaign.media_url);

        const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${twilio.lovableKey}`,
            "X-Connection-Api-Key": twilio.twilioKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          await supabaseAdmin.from("messages").update({
            status: "failed", error_code: String(json?.code ?? res.status),
          }).eq("id", m.id);
          failed++;
        } else {
          await supabaseAdmin.from("messages").update({
            status: "sent",
            provider_message_id: json.sid,
            sent_at: new Date().toISOString(),
            segments_count: Number(json.num_segments ?? 1),
          }).eq("id", m.id);
          queued++;
        }
      } catch (e) {
        await supabaseAdmin.from("messages").update({ status: "failed", error_code: "exception" }).eq("id", m.id);
        failed++;
      }
    }));
  }

  await supabaseAdmin.from("campaigns").update({ status: "sent" }).eq("id", campaign.id);
  return { queued, failed };
}

export const Route = createFileRoute("/api/public/dispatch-campaign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: require Supabase publishable key in apikey header
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const twilioKey = process.env.TWILIO_API_KEY;
        const messagingService = process.env.TWILIO_MESSAGING_SERVICE_SID;
        if (!lovableKey || !twilioKey || !messagingService) {
          return Response.json({ error: "Twilio not configured" }, { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pick up: explicitly-queued (Send now) + scheduled-due
        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .or(`status.eq.queued,and(status.eq.scheduled,schedule_at.lte.${nowIso})`)
          .limit(10);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: any[] = [];
        for (const c of due ?? []) {
          try {
            const r = await dispatchOne(supabaseAdmin, c, { lovableKey, twilioKey, messagingService });
            results.push({ id: c.id, ...r });
          } catch (e: any) {
            await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", c.id);
            results.push({ id: c.id, error: e.message });
          }
        }
        return Response.json({ processed: results.length, results });
      },
    },
  },
});
