import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Building2, UserCog, PhoneCall, CreditCard, Settings2,
  Mail, MessageSquareText, Activity, LogOut, ShieldCheck, ClipboardList,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const groups: { label: string; items: { title: string; url: string; icon: any; exact?: boolean }[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
      { title: "Activity log", url: "/admin/activity", icon: Activity },
    ],
  },
  {
    label: "Tenants",
    items: [
      { title: "Tenant accounts", url: "/admin/accounts", icon: Building2 },
      { title: "User management", url: "/admin/users", icon: UserCog },
      { title: "Number requests", url: "/admin/number-requests", icon: PhoneCall },
    ],
  },
  {
    label: "Messaging",
    items: [
      { title: "Message monitor", url: "/admin/messaging", icon: MessageSquareText },
      { title: "Contact inbox", url: "/admin/messages", icon: Mail },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Billing & payments", url: "/admin/billing", icon: CreditCard },
      { title: "Country rates", url: "/admin/rates", icon: Settings2 },
      { title: "Toll-free logs", url: "/admin/tollfree-attempts", icon: ClipboardList },
    ],
  },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="border-b border-border">
        <div className="p-2 flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary/15 grid place-items-center">
            <ShieldCheck className="size-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-semibold text-sm text-sidebar-foreground">SAMWELL</div>
              <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/70">Admin</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/70">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(it.url, it.exact)}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/15 data-[active=true]:text-sidebar-foreground"
                    >
                      <Link to={it.url} className="flex items-center gap-3">
                        <it.icon className="size-4" />
                        {!collapsed && <span>{it.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <LogOut className="size-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
