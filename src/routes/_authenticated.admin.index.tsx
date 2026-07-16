import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, MessageSquareText, AlertTriangle, DollarSign, Wallet,
  PhoneCall, ArrowRight, Loader2, TrendingUp, Send, Receipt, PiggyBank,
} from "lucide-react";
import { adminGetOverview } from "@/lib/admin-overview.functions";
import { formatUSD } from "@/lib/money";
import { EnableNotificationsButton } from "@/components/EnableNotificationsButton";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin overview — Xellvio" }] }),
  component: AdminOverview,
});

function Stat({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${accent ?? "text-primary"}`} />
      </div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function AdminOverview() {
  const fn = useServerFn(adminGetOverview);
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fn() });

  if (q.isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (q.isError || !q.data) {
    return <div className="text-sm text-destructive">Failed to load overview.</div>;
  }
  const d = q.data;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold">Platform overview</h1>
          <p className="text-sm text-muted-foreground">Live state of all tenants, messaging, and revenue.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/number-requests"><Button size="sm" variant="outline"><PhoneCall className="size-3.5 mr-1.5" />Review requests {d.pendingNumberRequests > 0 && <Badge className="ml-2" variant="destructive">{d.pendingNumberRequests}</Badge>}</Button></Link>
          <Link to="/admin/accounts"><Button size="sm"><Building2 className="size-3.5 mr-1.5" />Tenants</Button></Link>
        </div>
      </div>

      <Card className="p-4 border-primary/40 bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">Real-time push alerts</div>
            <div className="text-xs text-muted-foreground">Get notified on every signup, payment, and campaign — right on your phone.</div>
          </div>
          <EnableNotificationsButton />
        </div>
      </Card>


      {/* ─── Financials ─── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><PiggyBank className="size-4 text-primary" /> Financials</h2>
            <p className="text-xs text-muted-foreground">All-time totals in USD. Profit is estimated: revenue − carrier cost − unused credits still owed to tenants.</p>
          </div>
          <Link to="/admin/billing" className="text-xs text-primary inline-flex items-center gap-1">Billing details <ArrowRight className="size-3" /></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Receipt} label="Total collected" value={formatUSD(d.financials.totalCollected)} sub={`${d.financials.paymentsCount} payments · ${formatUSD(d.financials.collected30d)} in 30d`} />
          <Stat icon={Send} label="Spent on SMS (tenants)" value={formatUSD(d.financials.tenantSmsSpend)} sub={`${d.financials.messagesSentAllTime.toLocaleString()} messages · ${formatUSD(d.financials.smsSpend30d)} in 30d`} />
          <Stat icon={DollarSign} label="Carrier cost (Telnyx)" value={formatUSD(d.financials.carrierSmsCost)} accent="text-amber-500" sub={`${formatUSD(d.financials.carrierCost30d)} in 30d`} />
          <Stat icon={TrendingUp} label="Estimated profit" value={formatUSD(d.financials.estimatedProfit)} accent={d.financials.estimatedProfit >= 0 ? "text-emerald-500" : "text-destructive"} sub={`SMS margin: ${formatUSD(d.financials.smsMargin)}`} />
        </div>
        {Object.keys(d.financials.collectedByProvider).length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Collected by payment method</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.financials.collectedByProvider).map(([prov, amt]) => (
                <Badge key={prov} variant="secondary" className="text-xs">
                  {prov}: <span className="ml-1 font-semibold tabular-nums">{formatUSD(Number(amt))}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 pt-3 border-t grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Unused credits (liability)</div>
            <div className="font-semibold tabular-nums text-base">{formatUSD(d.financials.unusedCredits)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Revenue last 7 days</div>
            <div className="font-semibold tabular-nums text-base">{formatUSD(d.revenue.last7d)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Gross margin %</div>
            <div className="font-semibold tabular-nums text-base">
              {d.financials.tenantSmsSpend > 0
                ? `${((d.financials.smsMargin / d.financials.tenantSmsSpend) * 100).toFixed(1)}%`
                : "—"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Building2} label="Tenants" value={d.tenants.total} sub={`${d.tenants.active} active · ${d.tenants.suspended} suspended`} />
        <Stat icon={MessageSquareText} label="Messages 24h" value={d.messaging.sent24h.toLocaleString()} sub={`${d.messaging.sent7d.toLocaleString()} in 7d`} />
        <Stat icon={AlertTriangle} label="Failed 24h" value={d.messaging.failed24h.toLocaleString()} accent={d.messaging.failed24h ? "text-destructive" : "text-muted-foreground"} sub="Delivery failures" />
        <Stat icon={DollarSign} label="Revenue 7d" value={formatUSD(d.revenue.last7d)} sub={`${d.revenue.payments7d} payments`} />
        <Stat icon={Wallet} label="Credits on platform" value={formatUSD(d.credits.totalBalance)} sub="Total tenant balances" />
        <Stat icon={PhoneCall} label="Pending number requests" value={d.pendingNumberRequests} accent={d.pendingNumberRequests ? "text-amber-500" : "text-muted-foreground"} sub="Awaiting review" />
        <Stat icon={Users} label="New tenants 7d" value={d.recent.signups.length} sub="Most recent signups" />
        <Stat icon={MessageSquareText} label="Success rate 24h" value={`${d.messaging.sent24h ? Math.round(((d.messaging.sent24h - d.messaging.failed24h) / d.messaging.sent24h) * 100) : 100}%`} sub="Delivered / sent" />
      </div>


      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Latest signups</h2>
            <Link to="/admin/accounts" className="text-xs text-primary inline-flex items-center gap-1">View all <ArrowRight className="size-3" /></Link>
          </div>
          <div className="divide-y">
            {d.recent.signups.length === 0 && <div className="text-sm text-muted-foreground py-4">No signups yet.</div>}
            {d.recent.signups.map((s: any) => (
              <div key={s.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.full_name || s.company || s.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent messages</h2>
            <Link to="/admin/messaging" className="text-xs text-primary inline-flex items-center gap-1">Monitor <ArrowRight className="size-3" /></Link>
          </div>
          <div className="divide-y">
            {d.recent.messages.length === 0 && <div className="text-sm text-muted-foreground py-4">No messages yet.</div>}
            {d.recent.messages.map((m: any) => (
              <div key={m.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.phone_e164}</div>
                  <div className="text-xs text-muted-foreground truncate">{new Date(m.created_at).toLocaleString()}</div>
                </div>
                <Badge variant={m.status === "delivered" ? "default" : m.status === "failed" || m.status === "undelivered" ? "destructive" : "secondary"}>{m.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent payments</h2>
            <Link to="/admin/billing" className="text-xs text-primary inline-flex items-center gap-1">Billing <ArrowRight className="size-3" /></Link>
          </div>
          <div className="divide-y">
            {d.recent.payments.length === 0 && <div className="text-sm text-muted-foreground py-4">No payments yet.</div>}
            {d.recent.payments.map((p: any) => (
              <div key={p.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{formatUSD(Number(p.amount))} <span className="text-xs text-muted-foreground">· {p.provider}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{new Date(p.created_at).toLocaleString()}</div>
                </div>
                <Badge variant={p.status === "succeeded" || p.status === "approved" ? "default" : p.status === "rejected" || p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
