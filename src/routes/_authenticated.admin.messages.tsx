import { createFileRoute, redirect } from "@tanstack/react-router";

// Contact messages now arrive as support tickets.
export const Route = createFileRoute("/_authenticated/admin/messages")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/tickets" });
  },
});
