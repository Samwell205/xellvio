import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/poll-verifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { syncToollfreeVerifications } = await import("@/lib/sender-setup.server");
        const result = await syncToollfreeVerifications({});
        return Response.json(result);
      },
    },
  },
});
