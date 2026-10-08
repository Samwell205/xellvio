import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowRight, ArrowUpRight, Building2, CheckCheck, AlertTriangle, RefreshCw, PhoneCall, Bot, ShieldCheck, MessageSquareText, Scale, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminGetOverview } from "@/lib/admin-overview.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [
    { title: "Operations overview — Xellvio Admin" },
    { name: "description", content: "Xellvio platform operations, messaging outcomes, tenant activity and review priorities." },
    { property: "og:title", content: "Operations overview — Xellvio Admin" },
    { property: "og:description", content: "Monitor Xellvio messaging, tenant activity and operational priorities." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AdminOverview,
});

function Metric({ icon: Icon, label, value, detail, tone = "text-primary" }: { icon: LucideIcon; label: string; value?: number; detail: string; tone?: string }) {
  return <article className="admin-metric min-w-0 rounded-lg border border-border bg-card p-5 lg:p-6">
    <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><Icon className={`size-4 shrink-0 ${tone}`} /></div>
    {value === undefined ? <Skeleton className="my-4 h-10 w-24" /> : <div className="my-3 font-display text-4xl font-medium tabular-nums">{value.toLocaleString()}</div>}
    <div className="text-xs text-muted-foreground">{detail}</div>
  </article>;
}

function AdminOverview() {
  const fn = useServerFn(adminGetOverview);
  const q = useQuery({ queryKey: ["admin", "operations-overview"], queryFn: () => fn(), staleTime: 60000, retry: false, refetchOnWindowFocus: false });
  const d = q.data;
  const unresolved = d ? Math.max(0, d.messaging.total24h - d.messaging.delivered24h - d.messaging.failed24h) : 0;
  const outcomes = d ? [
    { label: "Delivered", value: d.messaging.delivered24h, color: "text-admin-highlight" },
    { label: "Failed / undelivered", value: d.messaging.failed24h, color: "text-coral" },
    { label: "Other / awaiting receipt", value: unresolved, color: "text-admin-feature-muted" },
  ] : [];
  return <div className="space-y-8">
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0"><div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" /> PLATFORM OPERATIONS</div><h1 className="text-3xl font-medium md:text-4xl">Command center<span className="text-primary">.</span></h1><p className="mt-2 text-sm text-muted-foreground">Your platform, at a glance.</p></div>
      <div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground lg:inline">{q.isFetching ? "Updating…" : d ? `Updated ${new Date(d.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span><Button variant="outline" size="icon" aria-label="Refresh overview" title="Refresh overview" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button><Button asChild className="hidden sm:inline-flex"><Link to="/admin/support"><Bot />Support copilot<ArrowUpRight /></Link></Button></div>
    </header>
    {q.isError && <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="size-5 shrink-0 text-destructive" /><div className="flex-1">Overview could not load. Your admin tools are still available.</div><Button variant="outline" size="sm" onClick={() => void q.refetch()}>Retry</Button></div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform metrics">
      <Metric icon={Building2} label="Total tenants" value={d?.tenants.total} detail={d ? `${d.tenants.new7d} joined in the last 7 days` : "Tenant workspaces"} />
      <Metric icon={MessageSquareText} label="Messages · 24h" value={d?.messaging.total24h} detail="Created in the last 24 hours" />
      <Metric icon={CheckCheck} label="Delivered · 24h" value={d?.messaging.delivered24h} detail="Confirmed delivery receipts" tone="text-admin-signal" />
      <Metric icon={AlertTriangle} label="Failures · 24h" value={d?.messaging.failed24h} detail="Failed and undelivered messages" tone="text-coral" />
    </section>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="relative overflow-hidden rounded-lg border border-admin-feature-line bg-admin-feature p-6 text-admin-feature-foreground md:p-8">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-admin-feature-muted"><Activity className="size-4 text-admin-highlight" /> MESSAGING PULSE</div><Badge className="border-admin-feature-line bg-transparent text-admin-feature-muted" variant="outline">Last 24 hours</Badge></div>
        <div className="mt-7 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4"><div><h2 className="text-2xl font-medium">Every message.<br />A clearer picture.</h2><p className="mt-3 text-xs text-admin-feature-muted">Delivery confirmed only when a receipt arrives.</p></div><div className="grid size-16 place-items-center rounded-full border border-admin-feature-line md:size-20"><Activity className="size-8 text-admin-highlight" /></div></div>
        <div className="mt-8 flex h-3 overflow-hidden rounded-sm bg-admin-feature-line" aria-label="Message outcomes">
          {d && d.messaging.total24h > 0 ? outcomes.map(o => <svg key={o.label} className={`h-3 min-w-0 ${o.color}`} style={{ flex: o.value }} preserveAspectRatio="none" viewBox="0 0 100 10" aria-hidden="true"><rect width="100" height="10" fill="currentColor" /></svg>) : <div className="h-full w-full bg-admin-feature-line" />}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">{d ? outcomes.map(o => <div key={o.label}><div className={`text-xl font-medium tabular-nums ${o.color}`}>{o.value.toLocaleString()}</div><div className="mt-1 text-[11px] text-admin-feature-muted">{o.label}</div></div>) : [1,2,3].map(i => <Skeleton key={i} className="h-12 bg-admin-feature-line" />)}</div>
        <Button asChild variant="ghost" className="mt-7 h-9 border border-admin-feature-line text-admin-feature-foreground hover:bg-admin-feature-line hover:text-admin-feature-foreground"><Link to="/admin/messaging">Open message monitor<ArrowUpRight /></Link></Button>
      </section>
      <section className="min-w-0">
        <div className="mb-4 flex items-center gap-2"><span className="size-2 rounded-full bg-coral" /><h2 className="text-lg font-medium">Needs your attention</h2></div>
        <div className="divide-y border-y border-border">
          <Link to="/admin/number-requests" className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-5"><PhoneCall className="size-5 text-primary" /><div className="min-w-0"><h3 className="text-sm font-medium">Number requests</h3><p className="mt-1 text-xs text-muted-foreground">Awaiting assignment</p></div><span className="text-xl tabular-nums">{d?.pendingNumberRequests ?? "—"}</span></Link>
          <Link to="/admin/compliance" className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-5"><ShieldCheck className="size-5 text-coral" /><div className="min-w-0"><h3 className="text-sm font-medium">Suspended tenants</h3><p className="mt-1 text-xs text-muted-foreground">Review account restrictions</p></div><span className="text-xl tabular-nums">{d?.tenants.suspended ?? "—"}</span></Link>
          <Link to="/admin/review-queue" className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-5"><Activity className="size-5 text-admin-signal" /><div className="min-w-0"><h3 className="text-sm font-medium">Content review</h3><p className="mt-1 text-xs text-muted-foreground">Inspect held campaigns</p></div><ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></Link>
        </div>
        <Button asChild variant="outline" className="mt-5 w-full justify-between"><Link to="/admin/finance"><span className="flex items-center gap-2"><Scale />Finance & reporting</span><ArrowRight /></Link></Button>
      </section>
    </div>
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="min-w-0"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-medium">Latest tenants</h2><Button asChild variant="ghost" size="sm"><Link to="/admin/accounts">View all<ArrowUpRight /></Link></Button></div><div className="divide-y border-y border-border">
        {!d ? [1,2,3].map(i => <Skeleton key={i} className="my-4 h-12" />) : d.recent.signups.length ? d.recent.signups.map(s => <div key={s.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4"><div className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card font-display text-sm text-primary">{(s.full_name || s.company || s.email || "T").slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{s.full_name || s.company || s.email}</div><div className="mt-1 truncate text-xs text-muted-foreground">{s.email}</div></div><span className="text-[11px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span></div>) : <p className="py-8 text-sm text-muted-foreground">No tenants yet.</p>}
      </div></section>
      <section className="min-w-0"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-medium">Recent message activity</h2><Button asChild variant="ghost" size="sm"><Link to="/admin/messaging">Monitor<ArrowUpRight /></Link></Button></div><div className="divide-y border-y border-border">
        {!d ? [1,2,3].map(i => <Skeleton key={i} className="my-4 h-12" />) : d.recent.messages.length ? d.recent.messages.map(m => <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4"><div className="min-w-0"><div className="truncate text-sm font-medium tabular-nums">{m.phone_e164}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div></div><Badge className="max-w-[160px] truncate rounded-md text-[10px]" variant={m.status === "failed" || m.status === "undelivered" ? "destructive" : "secondary"}>{m.status.replaceAll("_", " ")}</Badge></div>) : <p className="py-8 text-sm text-muted-foreground">No message activity yet.</p>}
      </div></section>
    </div>
  </div>;
}
