import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Megaphone, Settings, LogOut, Users, ShieldOff, Filter, Wallet, Calculator, Settings2, Building2, MessageSquareText, CreditCard, Mail, PhoneCall } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "./Logo";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Set up SMS", url: "/app/setup-sms", icon: MessageSquareText },
  { title: "Audience", url: "/app/audience", icon: Users },
  { title: "Segments", url: "/app/segments", icon: Filter },
  { title: "Suppressions", url: "/app/suppressions", icon: ShieldOff },
  { title: "Campaigns", url: "/app/campaigns", icon: Megaphone },
  { title: "Billing", url: "/app/billing", icon: Wallet },
  { title: "SMS Pricing", url: "/app/pricing-calculator", icon: Calculator },
  { title: "Settings", url: "/app/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string, exact?: boolean) => exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  const isAdmin = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => (await supabase.rpc("has_role", { _role: "admin" })).data === true,
  });

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="p-1.5">{!collapsed ? <Logo /> : <div className="size-8 rounded-lg bg-primary" />}</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)}>
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
        {isAdmin.data && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/admin/accounts")}>
                    <Link to="/app/admin/accounts" className="flex items-center gap-3">
                      <Building2 className="size-4" />
                      {!collapsed && <span>Tenant accounts</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/admin/rates")}>
                    <Link to="/app/admin/rates" className="flex items-center gap-3">
                      <Settings2 className="size-4" />
                      {!collapsed && <span>Rate management</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/admin/billing")}>
                    <Link to="/app/admin/billing" className="flex items-center gap-3">
                      <CreditCard className="size-4" />
                      {!collapsed && <span>Billing admin</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/admin/number-requests")}>
                    <Link to="/app/admin/number-requests" className="flex items-center gap-3">
                      <PhoneCall className="size-4" />
                      {!collapsed && <span>Number requests</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/admin/messages")}>
                    <Link to="/app/admin/messages" className="flex items-center gap-3">
                      <Mail className="size-4" />
                      {!collapsed && <span>Contact messages</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut className="size-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
