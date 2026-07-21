import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Megaphone, Settings, LogOut, Users, ShieldOff, Filter, Wallet, Calculator, MessageSquareText, ChevronDown, Inbox, UserPlus, ShieldCheck, GraduationCap, Building2 } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Logo } from "./Logo";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMySession } from "@/lib/session.functions";
import { getInboxUnreadCount } from "@/lib/inbox.functions";
import { useServerFn } from "@tanstack/react-start";
import type { PermissionKey } from "@/lib/team-permissions";

type Item = { title: string; url: string; icon: any; exact?: boolean; perm?: PermissionKey };

const items: Item[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, exact: true, perm: "dashboard" },
  { title: "Campaigns", url: "/app/campaigns", icon: Megaphone, perm: "campaigns" },
  { title: "Inbox", url: "/app/inbox", icon: Inbox, perm: "inbox" },
  { title: "Set up SMS", url: "/app/setup-sms", icon: MessageSquareText, perm: "setup_sms" },
  { title: "10DLC (US local)", url: "/app/setup-10dlc", icon: MessageSquareText, perm: "setup_sms" },
  { title: "Toll-free verification", url: "/app/toll-free-verification", icon: ShieldCheck, perm: "setup_sms" },
  { title: "Audience", url: "/app/audience", icon: Users, perm: "audience" },
  { title: "Segments", url: "/app/segments", icon: Filter, perm: "segments" },
  { title: "Suppressions", url: "/app/suppressions", icon: ShieldOff, perm: "suppressions" },
  { title: "Team", url: "/app/team", icon: UserPlus, perm: "team" },
  { title: "My Academy", url: "/app/my-academy", icon: GraduationCap },
];

const settingsChildren: Item[] = [
  { title: "Account", url: "/app/settings", icon: Settings, exact: true, perm: "settings" },
  { title: "Billing", url: "/app/billing", icon: Wallet, perm: "billing" },
  { title: "SMS Pricing", url: "/app/pricing-calculator", icon: Calculator },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string, exact?: boolean) => exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  const { data: session } = useQuery({
    queryKey: ["my-session"],
    queryFn: () => getMySession(),
    staleTime: 60_000,
  });

  const canSee = (perm?: PermissionKey) => {
    if (!perm) return true;
    if (!session) return true; // don't hide while loading
    if (session.isOwner) return true;
    return !!session.permissions[perm];
  };

  const visibleItems = items.filter((it) => canSee(it.perm));
  const canInbox = canSee("inbox");
  const acctKey = (session as any)?.accountId ?? (session as any)?.workspaceOwnerId ?? "self";
  const unreadFn = useServerFn(getInboxUnreadCount);
  const inboxQ = useQuery({
    queryKey: ["inbox-unread", acctKey],
    queryFn: () => {
      const sinceIso = typeof window !== "undefined"
        ? localStorage.getItem(`inbox_last_seen_${acctKey}`) ?? undefined
        : undefined;
      return unreadFn({ data: { sinceIso } });
    },
    enabled: canInbox,
    refetchInterval: 20_000,
  });
  const unread = pathname.startsWith("/app/inbox") ? 0 : (inboxQ.data?.count ?? 0);
  const visibleSettings = settingsChildren.filter((it) => canSee(it.perm));
  const settingsActive = visibleSettings.some((c) => isActive(c.url, c.exact));
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
        {!collapsed && session && !session.isOwner && (
          <div className="mx-2 mt-2 rounded-md border bg-muted/40 p-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5" />
              <span>Working in</span>
            </div>
            <div className="mt-0.5 font-medium truncate">
              {session.workspaceOwnerName || session.workspaceOwnerEmail || "shared workspace"}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
              {session.role}
            </div>
          </div>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleItems.map((it) => (
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

        {visibleSettings.length > 0 && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <Collapsible open={collapsed ? false : settingsOpen} onOpenChange={setSettingsOpen}>
                  <SidebarMenuItem>
                    {collapsed ? (
                      <SidebarMenuButton asChild isActive={settingsActive} className="h-8 text-sm">
                        <Link to={visibleSettings[0].url} className="flex items-center gap-3">
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
                          {visibleSettings.map((c) => (
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
        )}
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
