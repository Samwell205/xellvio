import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/email/events")({ server: { handlers: {
  POST: async ({ request }) => {
    const raw = await request.text();
    if (raw.length > 2000000) return new Response("Too large", { status: 413 });
    const { verifyEmailEvent, applyEmailEvents } = await import("@/lib/email-events.server");
    if (!await verifyEmailEvent(request, raw)) return new Response("Unauthorized", { status: 401 });
    try { return Response.json(await applyEmailEvents(raw)); } catch (e) { console.error("Email receipt processing failed", e); return new Response("Retry later", { status: 503 }); }
  },
} } });