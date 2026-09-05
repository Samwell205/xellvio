import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Megaphone, Settings, LogOut, Users, ShieldOff, Filter, Wallet, Calculator, MessageSquareText, ChevronDown, Inbox, UserPlus, ShieldCheck, Building2, Workflow, Sparkles, FormInput, LayoutTemplate, ListTree, Blocks, Code2 } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Logo } from "./Logo";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMySession } from "@/lib/session.functions";
import { getInboxUnreadCount } from "@/lib/inbox.functions";
import { useServerFn } from "@tanstack/react-start";
import type { PermissionKey } from "@/lib/team-permissions";

type Item = { title: string; url: string; icon: any; exact?: boolean; perm?: PermissionKey; ownerOnly?: boolean };
type Group = { title: string; icon: any; children: Item[] };
type Entry = Item | Group;

const isGroup = (e: Entry): e is Group => "children" in e;

const items: Entry[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, exact: true, perm: "dashboard" },
  { title: "Campaigns", url: "/app/campaigns", icon: Megaphone, perm: "campaigns" },
  { title: "Inbox", url: "/app/inbox", icon: Inbox, perm: "inbox" },
  {
    title: "Sender setup",
    icon: MessageSquareText,
    children: [
      { title: "Set up SMS", url: "/app/setup-sms", icon: MessageSquareText, perm: "setup_sms" },
      { title: "10DLC (US local)", url: "/app/setup-10dlc", icon: MessageSquareText, perm: "setup_sms" },
      { title: "Toll-free verification", url: "/app/toll-free-verification", icon: ShieldCheck, perm: "setup_sms" },
    ],
  },
  {
    title: "Contacts",
    icon: Users,
    children: [
      { title: "Audience", url: "/app/audience", icon: Users, perm: "audience" },
      { title: "Lists & segments", url: "/app/lists", icon: ListTree, perm: "audience" },
      { title: "Segments", url: "/app/segments", icon: Filter, perm: "segments" },
      { title: "Suppressions", url: "/app/suppressions", icon: ShieldOff, perm: "suppressions" },
    ],
  },
  { title: "Automations", url: "/app/automations", icon: Workflow, perm: "campaigns" },
  { title: "Flows", url: "/app/flows", icon: Workflow, perm: "campaigns" },
  {
    title: "Website",
    icon: Sparkles,
    children: [
      { title: "Sign-up forms", url: "/app/signup-forms", icon: FormInput, perm: "audience" },
      { title: "Landing pages", url: "/app/landing-pages", icon: LayoutTemplate, perm: "audience" },
    ],
  },
  {
    title: "Apps",
    icon: Blocks,
    children: [
      { title: "App Marketplace", url: "/app/apps", icon: Blocks, exact: true },
      { title: "Developer portal", url: "/app/developer", icon: Code2, ownerOnly: true },
    ],
  },
];

const advancedItems: Entry[] = [
  { title: "Team", url: "/app/team", icon: UserPlus, perm: "team" },
];



const settingsChildren: Item[] = [
  { title: "Account", url: "/app/settings", icon: Settings, exact: true, perm: "settings" },
  { title: "Billing", url: "/app/billing", icon: Wallet, perm: "billing" },
  { title: "SMS Pricing", url: "/app/pricing-calculator", icon: Calculator, ownerOnly: true },
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

  const canSee = (it: Item) => {
    // Hide everything until we know the session, so restricted links never flash.
    if (!session) return false;
    if (session.isOwner) return true;
    if (it.ownerOnly) return false;
    if (!it.perm) return true;
    return !!session.permissions[it.perm];
  };

  const visibleItems: Entry[] = items
    .map((e) => (isGroup(e) ? { ...e, children: e.children.filter(canSee) } : e))
    .filter((e) => (isGroup(e) ? e.children.length > 0 : canSee(e)));
  const visibleAdvanced: Entry[] = advancedItems.filter((e) => (isGroup(e) ? false : canSee(e)));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const groupActive = (g: Group) => g.children.some((c) => isActive(c.url, c.exact));
  useEffect(() => {
    const active = items.filter(isGroup).filter(groupActive).map((g) => g.title);
    if (active.length) setOpenGroups((p) => ({ ...p, ...Object.fromEntries(active.map((t) => [t, true])) }));
  }, [pathname]);

  const canInbox = canSee({ title: "Inbox", url: "/app/inbox", icon: Inbox, perm: "inbox" });
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
  const visibleSettings = settingsChildren.filter(canSee);
  const settingsActive = visibleSettings.some((c) => isActive(c.url, c.exact));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);
  useEffect(() => { if (settingsActive) setSettingsOpen(true); }, [settingsActive]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b h-16 justify-center px-4">
        <div className="flex items-center">
          {!collapsed ? <Logo className="text-xl" /> : <div className="size-8 rounded-lg bg-primary" />}
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1 py-3">
        {!collapsed && session && !session.isOwner && (
          <div className="mx-2 mb-1 rounded-lg border bg-muted/40 p-3 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5" />
              <span>Working in</span>
            </div>
            <div className="mt-1 font-medium truncate">
              {session.workspaceOwnerName || session.workspaceOwnerEmail || "shared workspace"}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
              {session.role}
            </div>
          </div>
        )}
        <SidebarGroup className="px-2 py-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map((entry) => {
                if (isGroup(entry)) {
                  const gActive = groupActive(entry);
                  const open = collapsed ? false : !!openGroups[entry.title];
                  return (
                    <Collapsible
                      key={entry.title}
                      open={open}
                      onOpenChange={(v) => setOpenGroups((p) => ({ ...p, [entry.title]: v }))}
                    >
                      <SidebarMenuItem>
                        {collapsed ? (
                          <SidebarMenuButton asChild isActive={gActive} className="h-10 px-3 text-[0.9375rem] rounded-lg">
                            <Link to={entry.children[0].url} className="flex items-center gap-3">
                              <entry.icon className="size-[1.125rem]" />
                            </Link>
                          </SidebarMenuButton>
                        ) : (
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton isActive={gActive} className="w-full h-10 px-3 text-[0.9375rem] rounded-lg">
                              <entry.icon className="size-[1.125rem]" />
                              <span className="truncate">{entry.title}</span>
                              <ChevronDown className={`ml-auto size-4 transition-transform ${open ? "rotate-180" : ""}`} />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                        )}
                        {!collapsed && (
                          <CollapsibleContent>
                            <SidebarMenuSub className="gap-1 mt-1">
                              {entry.children.map((c) => (
                                <SidebarMenuSubItem key={c.url}>
                                  <SidebarMenuSubButton asChild isActive={isActive(c.url, c.exact)} className="h-9">
                                    <Link to={c.url} className="flex items-center gap-2.5">
                                      <c.icon className="size-4" />
                                      <span className="truncate">{c.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        )}
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                const it = entry;
                const showBadge = it.url === "/app/inbox" && unread > 0;
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)} className="h-10 px-3 text-[0.9375rem] rounded-lg">
                      <Link to={it.url} className="flex items-center gap-3">
                        <it.icon className="size-[1.125rem] shrink-0" />
                        {!collapsed && <span className="truncate">{it.title}</span>}
                        {showBadge && !collapsed && (
                          <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold inline-flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                        {showBadge && collapsed && (
                          <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdvanced.length > 0 && (
          <SidebarGroup className="px-2 py-0 mt-4">
            {!collapsed && (
              <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-wider">
                Advanced
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {visibleAdvanced.filter((e) => !isGroup(e)).map((e) => {
                  const it = e as Item;
                  return (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)} className="h-10 px-3 text-[0.9375rem] rounded-lg">
                        <Link to={it.url} className="flex items-center gap-3">
                          <it.icon className="size-[1.125rem] shrink-0" />
                          {!collapsed && <span className="truncate">{it.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}




        {visibleSettings.length > 0 && (
          <SidebarGroup className="mt-auto px-2 py-0">
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-wider">Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <Collapsible open={collapsed ? false : settingsOpen} onOpenChange={setSettingsOpen}>
                  <SidebarMenuItem>
                    {collapsed ? (
                      <SidebarMenuButton asChild isActive={settingsActive} className="h-10 px-3 text-[0.9375rem] rounded-lg">
                        <Link to={visibleSettings[0].url} className="flex items-center gap-3">
                          <Settings className="size-[1.125rem]" />
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={settingsActive} className="w-full h-10 px-3 text-[0.9375rem] rounded-lg">
                          <Settings className="size-[1.125rem]" />
                          <span>Settings</span>
                          <ChevronDown className={`ml-auto size-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    )}
                    {!collapsed && (
                      <CollapsibleContent>
                        <SidebarMenuSub className="gap-1 mt-1">
                          {visibleSettings.map((c) => (
                            <SidebarMenuSubItem key={c.url}>
                              <SidebarMenuSubButton asChild isActive={isActive(c.url, c.exact)} className="h-9">
                                <Link to={c.url} className="flex items-center gap-2.5">
                                  <c.icon className="size-4" />
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
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12 px-2 rounded-lg data-[state=open]:bg-accent">
                  <span className="size-7 shrink-0 rounded-full bg-primary/15 text-primary grid place-items-center text-[11px] font-semibold">
                    {(session?.workspaceOwnerName || session?.workspaceOwnerEmail || "X").slice(0, 2).toUpperCase()}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-sm font-medium">
                          {session?.workspaceOwnerName || session?.workspaceOwnerEmail || "My workspace"}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground capitalize">
                          {session?.role ?? ""}
                        </span>
                      </span>
                      <ChevronDown className="ml-auto size-4 shrink-0" />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-xs text-muted-foreground">
                  {session?.workspaceOwnerEmail || "Signed in"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {visibleSettings.map((c) => (
                  <DropdownMenuItem key={c.url} asChild>
                    <Link to={c.url} className="flex items-center gap-2">
                      <c.icon className="size-4" />
                      {c.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="gap-2">
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

