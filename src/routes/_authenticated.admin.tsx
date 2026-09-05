import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { ShieldCheck } from "lucide-react";
import { getCachedIsAdmin } from "@/lib/auth-cache";
import { Badge } from "@/components/ui/badge";
import { LowBalanceBanner } from "@/components/BalanceCard";
import { RouteFallback } from "@/components/RouteFallback";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    // Cached per session: repeating this RPC on every admin navigation added a
    // round-trip of dead time before any page could render.
    if (!(await getCachedIsAdmin())) throw redirect({ to: "/app" });
  },
  pendingComponent: RouteFallback,
  component: AdminShell,
});

function AdminShell() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-slate-950 text-slate-100">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 sticky top-0 z-30 bg-slate-950/80 backdrop-blur border-b border-slate-800 flex items-center gap-3 px-4">
            <SidebarTrigger className="text-slate-200 hover:text-white" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <span className="font-semibold tracking-tight">Admin console</span>
              <Badge variant="outline" className="border-slate-700 text-slate-300">
                Platform
              </Badge>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-[1500px] w-full mx-auto">
            <div className="admin-surface text-foreground bg-background rounded-xl border border-slate-800/60 p-4 md:p-6 shadow-2xl space-y-4">
              <LowBalanceBanner />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
