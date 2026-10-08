import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { getCachedIsAdmin } from "@/lib/auth-cache";
import { RouteFallback } from "@/components/RouteFallback";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    if (!(await getCachedIsAdmin())) throw redirect({ to: "/app" });
  },
  pendingComponent: RouteFallback,
  component: AdminShell,
});

function AdminShell() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const section = pathname.split("/")[2]?.replaceAll("-", " ") || "overview";
  return <SidebarProvider className="admin-workspace font-dash">
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 grid h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-3"><SidebarTrigger /><div className="min-w-0 text-sm"><span className="hidden text-muted-foreground sm:inline">Workspace <span className="mx-3 text-border">/</span></span><span className="capitalize truncate">{section}</span></div></div>
          <div className="flex shrink-0 items-center gap-3"><ThemeToggle /><Button asChild variant="ghost" size="icon" title="Open tenant workspace"><Link to="/app" aria-label="Open tenant workspace"><ArrowUpRight /></Link></Button><div className="hidden size-8 place-items-center rounded-md border border-border bg-card sm:grid"><ShieldCheck className="size-4 text-primary" /></div></div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-8 lg:p-10"><div key={pathname} className="admin-page-enter min-w-0"><Outlet /></div></main>
      </div>
    </div>
  </SidebarProvider>;
}
