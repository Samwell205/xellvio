import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Megaphone, Settings, LogOut, Users, ShieldOff, Filter, Wallet, Calculator, MessageSquareText, ChevronDown, Inbox, UserPlus } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Logo } from "./Logo";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

const items = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Campaigns", url: "/app/campaigns", icon: Megaphone },
  { title: "Inbox", url: "/app/inbox", icon: Inbox },
  { title: "Set up SMS", url: "/app/setup-sms", icon: MessageSquareText },
  { title: "Audience", url: "/app/audience", icon: Users },
  { title: "Segments", url: "/app/segments", icon: Filter },
  { title: "Suppressions", url: "/app/suppressions", icon: ShieldOff },
  { title: "Team", url: "/app/team", icon: UserPlus },
];

const settingsChildren = [
  { title: "Account", url: "/app/settings", icon: Settings, exact: true },
  { title: "Billing", url: "/app/billing", icon: Wallet },
  { title: "SMS Pricing", url: "/app/pricing-calculator", icon: Calculator },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string, exact?: boolean) => exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");
  const settingsActive = settingsChildren.some((c) => isActive(c.url, c.exact));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);
  useEffect(() => { if (settingsActive) setSettingsOpen(true); }, [settingsActive]);

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
            <SidebarMenu className="gap-0.5">
              {items.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)} className="h-8 text-sm">
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

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <Collapsible open={collapsed ? false : settingsOpen} onOpenChange={setSettingsOpen}>
                <SidebarMenuItem>
                  {collapsed ? (
                    <SidebarMenuButton asChild isActive={settingsActive} className="h-8 text-sm">
                      <Link to="/app/settings" className="flex items-center gap-3">
                        <Settings className="size-4" />
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={settingsActive} className="w-full h-8 text-sm">
                        <Settings className="size-4" />
                        <span>Settings</span>
                        <ChevronDown className={`ml-auto size-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  )}
                  {!collapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub className="gap-0.5">
                        {settingsChildren.map((c) => (
                          <SidebarMenuSubItem key={c.url}>
                            <SidebarMenuSubButton asChild isActive={isActive(c.url, c.exact)}>
                              <Link to={c.url} className="flex items-center gap-2">
                                <c.icon className="size-3.5" />
                                <span>{c.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="h-8 text-sm">
              <LogOut className="size-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
