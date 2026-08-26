// Short-link click tracker. Recipients click e.g. https://xellvio.com/r/aB3xY9k1
// We record the click and 302 redirect to the original URL.
import { createFileRoute } from "@tanstack/react-router";

const SITE = (process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://xellvio.com").replace(/\/+$/, "");

/** A real HTML page (never a downloadable text file) when a code is unknown. */
function notFoundResponse(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Link unavailable</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0f;color:#f5f5f7;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}
.card{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 10px}p{margin:0 0 20px;color:#a1a1aa}
a{display:inline-block;background:#f5f5f7;color:#0b0b0f;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px}</style>
</head><body><div class="card"><h1>This link is no longer available</h1>
<p>It may have expired or been typed incorrectly. If someone sent it to you, ask them for a fresh link.</p>
<a href="${SITE}">Go to homepage</a></div></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Recover a destination for a code whose tracking row went missing: find the
 * message that actually contains the code and reuse its campaign's link. */
async function healMissingCode(code: string) {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id,campaign_id,account_id")
    .like("rendered_body", `%/r/${code}%`)
    .limit(1)
    .maybeSingle();
  if (!msg?.campaign_id) return null;

  const { data: sibling } = await supabaseAdmin
    .from("link_clicks")
    .select("url")
    .eq("campaign_id", msg.campaign_id)
    .limit(1)
    .maybeSingle();
  let url: string | null = (sibling as any)?.url ?? null;

  if (!url) {
    const { data: camp } = await supabaseAdmin
      .from("campaigns")
      .select("message_body")
      .eq("id", msg.campaign_id)
      .maybeSingle();
    url = ((camp as any)?.message_body ?? "").match(/https?:\/\/[^\s<>()[\]"']+/)?.[0] ?? null;
  }
  if (!url) return null;

  // Recreate the row so future clicks (and the report) count normally.
  await supabaseAdmin.from("link_clicks").insert({
    short_code: code,
    url,
    message_id: (msg as any).id,
    campaign_id: msg.campaign_id,
    account_id: (msg as any).account_id ?? null,
    clicks: 1,
    first_click_at: new Date().toISOString(),
    last_click_at: new Date().toISOString(),
  } as any);

  return { url, message_id: (msg as any).id, campaign_id: msg.campaign_id };
}



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
