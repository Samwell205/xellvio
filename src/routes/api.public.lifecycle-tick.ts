import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled customer-lifecycle checks (onboarding reminders, celebrations,
 * re-engagement, low balance, feature discovery). Called by the platform
 * scheduler with the project key.
 */
export const Route = createFileRoute("/api/public/lifecycle-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runLifecycleChecks } = await import("@/lib/lifecycle/scheduler.server");
        const result = await runLifecycleChecks(200);
        return Response.json(result);
      },
    },
  },
});
