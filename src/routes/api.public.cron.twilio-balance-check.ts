import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/twilio-balance-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { checkTwilioBalanceAndAlert } = await import("@/lib/twilio-balance.server");
        const result = await checkTwilioBalanceAndAlert();

        // Auto-resume any paused campaigns now that we have a fresh balance
        let resumed: string[] = [];
        try {
          const { resumePausedCampaigns } = await import("@/lib/twilio-resume.server");
          resumed = await resumePausedCampaigns();
        } catch (e) {
          console.error("[cron] resumePausedCampaigns failed", e);
        }

        return Response.json({ ...result, resumed_campaign_ids: resumed });
      },
    },
  },
});
