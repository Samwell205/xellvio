import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/run-flows")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { processDueFlowRuns } = await import("@/lib/flows.server");
        const result = await processDueFlowRuns(150);
        const { processDueAutomationRuns } = await import("@/lib/automation-engine.server");
        const automations = await processDueAutomationRuns(150);
        return Response.json({ ...result, automations });
      },
    },
  },
});
