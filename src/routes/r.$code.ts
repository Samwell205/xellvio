// Short-link click tracker. Recipients click e.g. https://xellvio.com/r/aB3xY9k1
// We record the click and 302 redirect to the original URL.
import { createFileRoute } from "@tanstack/react-router";

async function trackAndRedirect(code: string, request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Atomic increment + fetch in one round-trip. This MUST be awaited: the
  // serverless runtime cancels any in-flight work the moment the response is
  // returned, so the previous fire-and-forget update silently lost clicks.
  const { data: rows, error } = await (supabaseAdmin as any).rpc("record_link_click", {
    _code: code,
  });
  let link = Array.isArray(rows) ? rows[0] : rows;

  if (error || !link) {
    // Fall back to a plain read so a counter failure never breaks the redirect.
    const { data: fallback } = await supabaseAdmin
      .from("link_clicks")
      .select("url, message_id, campaign_id")
      .eq("short_code", code)
      .maybeSingle();
    if (fallback) {
      link = fallback;
    } else {
      // Self-heal: the code is in a real delivered message but its tracking row
      // is missing. Recover the destination from the campaign that sent it so
      // the recipient still lands on the right page.
      const healed = await healMissingCode(code);
      if (!healed) return notFoundResponse();
      link = healed;
    }
  }


  const ua = request.headers.get("user-agent") ?? null;
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")
    ?? null;
  try {
    await supabaseAdmin.from("events").insert({
      message_id: link.message_id,
      type: "clicked",
      payload: { short_code: code, url: link.url, ua, ip, campaign_id: link.campaign_id },
    });
  } catch {
    /* click audit is best-effort */
  }

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
