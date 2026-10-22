import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/poll-verifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorizedCronRequest(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { syncToollfreeVerifications } = await import("@/lib/sender-setup.server");
        const result = await syncToollfreeVerifications({});
        return Response.json(result);
      },
    },
  },
});
