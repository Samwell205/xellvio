import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, UserCog, PhoneCall, CreditCard, Settings2, Mail, MessageSquareText, Activity, LogOut, ShieldCheck, ClipboardList, ShieldOff, Radio, Megaphone, Scale, PhoneOutgoing, Send, Blocks, Handshake, KeyRound, LineChart, Gauge, HeartHandshake, Bot, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

type Item = { title: string; url: string; icon: LucideIcon; exact?: boolean };
const primary: Item[] = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Support copilot", url: "/admin/support", icon: Bot },
  { title: "Review queue", url: "/admin/review-queue", icon: ClipboardList },
  { title: "Tenant accounts", url: "/admin/accounts", icon: Building2 },
];
const groups: { label: string; items: Item[] }[] = [
  { label: "Messaging", items: [
    { title: "Campaigns", url: "/admin/campaigns", icon: Megaphone },
    { title: "Message monitor", url: "/admin/messaging", icon: MessageSquareText },
    { title: "Contact inbox", url: "/admin/messages", icon: Mail },
    { title: "Tenant notices", url: "/admin/email", icon: Send },
    { title: "Compliance", url: "/admin/compliance", icon: ShieldOff },
  ] },
  { label: "Tenants & numbers", items: [
    { title: "User management", url: "/admin/users", icon: UserCog },
    { title: "Number requests", url: "/admin/number-requests", icon: PhoneCall },
    { title: "Tenant senders", url: "/admin/senders", icon: Radio },
    { title: "API access", url: "/admin/api-access", icon: KeyRound },
    { title: "Verifier marketplace", url: "/admin/verifiers", icon: ShieldCheck },
  ] },
  { label: "Finance", items: [
    { title: "Finance analysis", url: "/admin/finance", icon: Scale },
    { title: "Billing & payments", url: "/admin/billing", icon: CreditCard },
    { title: "Country rates", url: "/admin/rates", icon: Settings2 },
  ] },
  { label: "Advanced", items: [
    { title: "Activity log", url: "/admin/activity", icon: Activity },
    { title: "Carrier activity", url: "/admin/telnyx", icon: Radio },
    { title: "Balance-drop audit", url: "/admin/telnyx/audit", icon: Scale },
    { title: "Number activity", url: "/admin/telnyx/tfn", icon: PhoneOutgoing },
    { title: "Toll-free logs", url: "/admin/tollfree-attempts", icon: ClipboardList },
    { title: "Authority & links", url: "/admin/authority", icon: Handshake },
    { title: "Growth intelligence", url: "/admin/growth", icon: LineChart },
    { title: "Customer success", url: "/admin/lifecycle", icon: HeartHandshake },
    { title: "Speed & experience", url: "/admin/performance", icon: Gauge },
    { title: "Marketplace", url: "/admin/marketplace", icon: CreditCard },
    { title: "App Marketplace", url: "/admin/apps", icon: Blocks },
  ] },
];

export function AdminSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Messaging: true });
  const isActive = (it: Item) => it.exact ? pathname === it.url || pathname === it.url + "/" : pathname === it.url || pathname.startsWith(it.url + "/");
  const matches = (it: Item) => it.title.toLowerCase().includes(search.toLowerCase());
  const menu = (items: Item[]) => <SidebarMenu>{items.filter(matches).map(it => (
    <SidebarMenuItem key={it.url}>
      <SidebarMenuButton asChild isActive={isActive(it)} tooltip={it.title} className="admin-nav-item h-10">
        <Link to={it.url} onClick={() => { if (isMobile) setOpenMobile(false); }}><it.icon className="size-4 shrink-0" />{!collapsed && <span className="truncate">{it.title}</span>}</Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))}</SidebarMenu>;
  return <Sidebar collapsible="icon" className="admin-navigation border-r border-border">
    <SidebarHeader className="border-b border-border px-4 py-6 group-data-[collapsible=icon]:px-2">
      <Logo iconOnly={collapsed} className="text-foreground font-display" />
      {!collapsed && <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground"><ShieldCheck className="size-3" /> ADMIN WORKSPACE</div>}
    </SidebarHeader>
    <SidebarContent className="gap-1 px-2 py-4">
      {!collapsed && <div className="relative mx-2 mb-4"><Search className="absolute left-3 top-3 size-3.5 text-muted-foreground" /><Input aria-label="Find an admin page" placeholder="Find a page…" className="h-9 pl-9 text-xs bg-background" value={search} onChange={e => setSearch(e.target.value)} /></div>}
      <SidebarGroup className="pt-0">{menu(primary)}</SidebarGroup>
      {groups.map(g => {
        const active = g.items.some(isActive);
        const open = expanded[g.label] ?? active;
        if (search && !g.items.some(matches)) return null;
        return <SidebarGroup key={g.label} className="py-1">
          {!collapsed && <Button variant="ghost" size="sm" className="mb-1 w-full justify-between text-xs text-muted-foreground" aria-expanded={open || !!search} aria-controls={`admin-group-${g.label.replaceAll(' ', '-')}`} onClick={() => setExpanded(s => ({ ...s, [g.label]: !open }))}>{g.label}<ChevronDown className={`size-3 transition-transform ${open || search ? "rotate-180" : ""}`} /></Button>}
          {(collapsed || open || search) && <SidebarGroupContent id={`admin-group-${g.label.replaceAll(' ', '-')}`} className="admin-reveal">{menu(g.items)}</SidebarGroupContent>}
        </SidebarGroup>;
      })}
      {search && ![...primary, ...groups.flatMap(g => g.items)].some(matches) && <p className="p-4 text-xs text-muted-foreground">No pages found.</p>}
    </SidebarContent>
    <SidebarFooter className="border-t border-border p-3">
      {!collapsed && <Button asChild variant="outline" className="mb-2 justify-start"><Link to="/app"><Building2 className="size-4" />Tenant workspace</Link></Button>}
      <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Sign out" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}><LogOut className="size-4" />{!collapsed && <span>Sign out</span>}</SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarFooter>
  </Sidebar>;
}
