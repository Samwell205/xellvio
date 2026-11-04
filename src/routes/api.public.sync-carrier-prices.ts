import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Scheduled: records Twilio's actual price for finalized messages. Lookup-only.
export const Route = createFileRoute("/api/public/sync-carrier-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncTwilioPrices } = await import("@/lib/twilio-price-sync.server");
        return Response.json(await syncTwilioPrices(supabaseAdmin, { limit: 600, budgetMs: 25_000 }));
      },
    },
  },
});
