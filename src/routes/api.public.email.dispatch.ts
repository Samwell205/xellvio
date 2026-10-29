import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/email/dispatch")({ server: { handlers: {
  POST: async ({ request }) => {
    const { isAuthorizedCronRequest } = await import("@/lib/cron-auth.server");
    if (!await isAuthorizedCronRequest(request)) return new Response("Unauthorized", { status: 401 });
    const { processEmailQueue } = await import("@/lib/email-campaigns.server");
    try { return Response.json(await processEmailQueue()); } catch (e) { console.error("Email dispatch failed", e); return new Response("Retry later", { status: 503 }); }
  },
} } });