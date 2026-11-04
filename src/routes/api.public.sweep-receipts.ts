import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Scheduled safety net: looks up final carrier results for dedicated-line
// messages still "sent" after 20 minutes (missed receipts). Lookup-only.
export const Route = createFileRoute("/api/public/sweep-receipts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recoverTwilioReceipts } = await import("@/lib/twilio-receipt-recovery.server");
        const result = await recoverTwilioReceipts(supabaseAdmin, { olderThanMin: 20, maxAgeHours: 72, limit: 240, budgetMs: 25_000 });
        return Response.json(result);
      },
    },
  },
});
