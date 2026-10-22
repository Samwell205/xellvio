import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Scheduled poll — checks the Telnyx balance, persists a snapshot, and fires
// a low/critical-balance alert email if the threshold was just crossed.
// Called by the `poll-carrier-balance` pg_cron job (see supabase/migrations).
export const Route = createFileRoute("/api/public/poll-carrier-balance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { checkTwilioBalanceAndAlert } = await import("@/lib/twilio-balance.server");
        const result = await checkTwilioBalanceAndAlert();
        return Response.json(result);
      },
    },
  },
});
