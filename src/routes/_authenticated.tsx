import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ensureMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (!data.user.email_confirmed_at) {
      throw redirect({ to: "/verify-email", search: { email: data.user.email ?? "" } });
    }
    await ensureMyAccount();
    return { user: data.user };
  },
  component: AppLayout,
});

function AppLayout() {
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
              <div className="size-8 rounded-full bg-gradient-to-br from-primary to-primary/60" />
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
