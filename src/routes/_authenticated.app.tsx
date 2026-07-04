import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { provisionCurrentAccount } from "@/lib/provision-account.functions";
import { TosReAcceptModal } from "@/components/TosReAcceptModal";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: async () => {
    // Admins use a dedicated admin console and don't have tenant SMS/campaign UI.
    const { data } = await supabase.rpc("has_role", { _role: "admin" });
    if (data === true) throw redirect({ to: "/admin" });
  },
  component: AppShell,
});

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
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
