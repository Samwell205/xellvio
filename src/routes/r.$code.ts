// Short-link click tracker. Recipients click e.g. https://xellvio.com/r/aB3xY9k1
// We record the click and 302 redirect to the original URL.
import { createFileRoute } from "@tanstack/react-router";

async function trackAndRedirect(code: string, request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin
    .from("link_clicks")
    .select("short_code, url, message_id, campaign_id, clicks, first_click_at")
    .eq("short_code", code)
    .maybeSingle();

  if (!link) {
    return new Response("Link not found or expired.", { status: 404 });
  }

  const now = new Date().toISOString();
  const patch: any = {
    clicks: (link.clicks ?? 0) + 1,
    last_click_at: now,
  };
  if (!link.first_click_at) patch.first_click_at = now;

  // Fire-and-continue; failures never block the redirect.
  supabaseAdmin.from("link_clicks").update(patch).eq("short_code", code).then(() => {}, () => {});

  const ua = request.headers.get("user-agent") ?? null;
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")
    ?? null;
  supabaseAdmin.from("events").insert({
    message_id: link.message_id,
    type: "clicked",
    payload: { short_code: code, url: link.url, ua, ip, campaign_id: link.campaign_id },
  }).then(() => {}, () => {});

  return new Response(null, { status: 302, headers: { Location: link.url, "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => trackAndRedirect(params.code, request),
      HEAD: async ({ params, request }) => trackAndRedirect(params.code, request),
    },
  },
});
