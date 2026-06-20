import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sync-twilio-pricing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runTwilioPricingSync } = await import("@/lib/twilio-pricing.server");
        const result = await runTwilioPricingSync();
        return Response.json(result);
      },
    },
  },
});
