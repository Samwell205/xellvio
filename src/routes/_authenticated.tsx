import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureMyAccount } from "@/lib/account.functions";
import { claimPendingInvites } from "@/lib/team.functions";
import { claimAccountEnsure, getCachedUser } from "@/lib/auth-cache";
import { RouteFallback } from "@/components/RouteFallback";

export const Route = createFileRoute("/_authenticated")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  ssr: false,
  beforeLoad: async () => {
    // Session check reads the locally stored, signed session on repeat
    // navigations instead of round-tripping to the auth server every time.
    const user = await getCachedUser();
    if (!user) throw redirect({ to: "/auth" });
    if (!user.email_confirmed_at) {
      throw redirect({ to: "/verify-email", search: { email: user.email ?? "" } });
    }
    // Account provisioning happens once per session (awaited that first time so
    // pages can rely on the workspace row existing); afterwards route changes
    // never pay for it. Invite claiming is always best-effort in the background.
    if (claimAccountEnsure()) {
      await ensureMyAccount().catch(() => {});
      claimPendingInvites().catch(() => {});
    }
    return { user };
  },
  pendingComponent: RouteFallback,
  component: () => <Outlet />,
});
