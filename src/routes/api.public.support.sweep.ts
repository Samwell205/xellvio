import { createFileRoute } from "@tanstack/react-router";

// Hourly reminder / auto-close check. Idempotent: timing comes from stored
// timestamps and each email is sent at most once, so an early call does nothing.
export const Route = createFileRoute("/api/public/support/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SUPPORT_SWEEP_SECRET;
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        // Fail closed: without a configured secret, nobody may trigger the sweep.
        if (!secret || !token || token !== secret) return new Response("Unauthorized", { status: 401 });
        const { sweepTickets } = await import("@/lib/support-tickets.server");
        return Response.json(await sweepTickets());
      },
    },
  },
});
