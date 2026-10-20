import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/oauth/calendar/return")({ server: { handlers: { GET: async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const success = url.searchParams.get("success") === "true" && url.searchParams.get("connector_id") === "google_calendar" && typeof code === "string" && code.length > 0 && code.length <= 2048;
  const message = JSON.stringify({ type: success ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed", connectorId: "google_calendar", code: success ? code : null }).replace(/</g, "\\u003c");
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html><head><title>Google Calendar connection — Xellvio</title></head><body><p>${success ? "Finishing Google Calendar connection…" : "Calendar connection did not complete. Return to Xellvio and try again."}</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${message},window.location.origin);window.close();}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'` } });
} } } });