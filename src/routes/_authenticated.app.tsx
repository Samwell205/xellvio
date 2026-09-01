import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { provisionCurrentAccount } from "@/lib/provision-account.functions";
import { TosReAcceptModal } from "@/components/TosReAcceptModal";
import { useSession } from "@/hooks/useAccountId";
import { firstAllowedPath, isOwnerOnlyPath, requiredPermissionFor } from "@/lib/route-permissions";
import { PERMISSION_LABELS } from "@/lib/team-permissions";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: async () => {
    // Admins use a dedicated admin console and don't have tenant SMS/campaign UI.
    const { data } = await supabase.rpc("has_role", { _role: "admin" });
    if (data === true) throw redirect({ to: "/admin" });
  },
  component: AppShell,
});

/**
 * Blocks teammates from opening areas the workspace owner did not grant them,
 * even by typing the URL directly. Owners are never restricted.
 */
function PermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();

  const needed = requiredPermissionFor(pathname);
  const ownerOnly = isOwnerOnlyPath(pathname);
  const allowed =
    !session ||
    session.isOwner ||
    (!ownerOnly && (!needed || session.permissions[needed] === true));

  useEffect(() => {
    if (!session || allowed) return;
    const target = firstAllowedPath(session.permissions);
    if (target !== pathname) navigate({ to: target, replace: true });
  }, [session, allowed, pathname, navigate]);

  if (isLoading || allowed) return <>{children}</>;

  return (
    <div className="max-w-md mx-auto mt-16 rounded-lg border bg-background p-6 text-center">
      <Lock className="size-6 mx-auto text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">You don't have access to this area</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your access to this workspace doesn't include{" "}
        {needed ? PERMISSION_LABELS[needed] : "this page"}. Ask the workspace owner to enable it.
      </p>
    </div>
  );
}

function AppShell() {
  // Ensure this tenant has a carrier messaging profile provisioned.
  // Idempotent: no-op if already set. Covers new signups AND existing users.
  const provisioned = useRef(false);
  useEffect(() => {
    if (provisioned.current) return;
    provisioned.current = true;
    provisionCurrentAccount().catch(() => { /* non-fatal */ });
  }, []);


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 sticky top-0 z-30 bg-background/80 backdrop-blur border-b flex items-center gap-3 px-4">
            <SidebarTrigger />
            <div className="relative flex-1 max-w-md hidden md:block">
              <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input placeholder="Search contacts, campaigns…" className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className="size-9 grid place-items-center rounded-md hover:bg-accent" aria-label="Notifications">
                <Bell className="size-4" />
              </button>
              <Link to="/app/settings" aria-label="Account settings" className="size-8 rounded-full bg-gradient-to-br from-primary to-primary/60 hover:ring-2 hover:ring-primary/40 transition" />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
            <PermissionGuard>
              <Outlet />
            </PermissionGuard>
          </main>

        </div>
        <TosReAcceptModal />
      </div>
    </SidebarProvider>
  );
}
