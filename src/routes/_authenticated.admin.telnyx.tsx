import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, ExternalLink, RefreshCw, TrendingDown } from "lucide-react";
import { getTelnyxSpendOverview, getTelnyxLiveBalance } from "@/lib/admin-telnyx.functions";
import { formatUSD } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/telnyx")({
  head: () => ({ meta: [{ title: "Admin · Telnyx activity — Xellvio" }] }),
  component: AdminTelnyxPage,
});

function AdminTelnyxPage() {
  const spendFn = useServerFn(getTelnyxSpendOverview);
  const balFn = useServerFn(getTelnyxLiveBalance);

  const spend = useQuery({ queryKey: ["admin-telnyx-spend"], queryFn: () => spendFn(), refetchInterval: 60_000 });
  const bal = useQuery({ queryKey: ["admin-telnyx-live"], queryFn: () => balFn(), refetchInterval: 60_000 });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Phone className="size-6" /> Telnyx activity</h1>
        <p className="text-sm text-muted-foreground">Live balance, every dollar spent, and what each campaign cost you at Telnyx.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Telnyx balance (live)</div>
          <div className="text-3xl font-extrabold tabular-nums mt-1">
            {bal.data?.ok ? formatUSD(Number(bal.data.balance)) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {bal.data?.ok
              ? `Fetched ${new Date(bal.data.checked_at).toLocaleTimeString()} from Telnyx`
              : bal.data?.error ?? "Loading…"}
          </div>
          <Button
            asChild size="sm" variant="outline" className="mt-3"
          >
            <a href="https://portal.telnyx.com/#/app/billing/transactions" target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5 mr-1.5" />
              Open Telnyx billing
            </a>
          </Button>
        </Card>
        <SpendBox label="Spent last 24h" v={spend.data?.windows.last_24h} />
        <SpendBox label="Spent last 7 days" v={spend.data?.windows.last_7d} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><TrendingDown className="size-4" /> Where the balance went</h3>
          <Button size="sm" variant="ghost" onClick={() => { spend.refetch(); bal.refetch(); }}>
            <RefreshCw className={`size-3.5 mr-1.5 ${spend.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        {spend.data && spend.data.implied_spend_from_snapshots !== null && (
          <p className="text-sm text-muted-foreground">
            Over the last 30 days our recorded balance moved by{" "}
            <strong className="text-foreground">{formatUSD(spend.data.implied_spend_from_snapshots)}</strong>.
            Our messages table accounts for{" "}
            <strong className="text-foreground">{formatUSD(spend.data.windows.last_30d.telnyx_cost)}</strong> of Telnyx carrier cost in the same window.
            {" "}The gap (if any) is number rentals, verification fees, or MMS not billed through campaigns.
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <BalanceTrend snapshots={spend.data?.snapshots ?? []} />
          <DailySpend rows={spend.data?.daily ?? []} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Spend by country (last 30 days)</h3>
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left p-3">Country</th>
                <th className="text-right p-3">Messages</th>
                <th className="text-right p-3">Segments</th>
                <th className="text-right p-3">Telnyx cost</th>
                <th className="text-right p-3">Tenants paid</th>
                <th className="text-right p-3">Profit</th>
              </tr>
            </thead>
            <tbody>
              {(spend.data?.windows.last_30d.by_country ?? []).map((c) => (
                <tr key={c.country} className="border-t">
                  <td className="p-3 font-medium">{c.country}</td>
                  <td className="p-3 text-right tabular-nums">{c.messages.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{c.segments.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums text-destructive">{formatUSD(c.telnyx_cost)}</td>
                  <td className="p-3 text-right tabular-nums text-success">{formatUSD(c.tenant_spend)}</td>
                  <td className="p-3 text-right tabular-nums font-medium">{formatUSD(c.tenant_spend - c.telnyx_cost)}</td>
                </tr>
              ))}
              {(spend.data?.windows.last_30d.by_country ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No activity.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Top campaigns by Telnyx cost (last 30 days)</h3>
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left p-3">Campaign</th>
                <th className="text-left p-3">Tenant</th>
                <th className="text-right p-3">Segments</th>
                <th className="text-right p-3">Telnyx cost</th>
                <th className="text-right p-3">Tenant spend</th>
                <th className="text-right p-3">Profit</th>
              </tr>
            </thead>
            <tbody>
              {(spend.data?.top_campaigns ?? []).map((c) => (
                <tr key={c.campaign_id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm">{c.tenant_name}</div>
                    <div className="text-xs text-muted-foreground">{c.tenant_email}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{c.segments.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums text-destructive">{formatUSD(c.telnyx_cost)}</td>
                  <td className="p-3 text-right tabular-nums text-success">{formatUSD(c.tenant_spend)}</td>
                  <td className="p-3 text-right tabular-nums font-medium">{formatUSD(c.margin)}</td>
                </tr>
              ))}
              {(spend.data?.top_campaigns ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No campaigns in window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Where to double-check on Telnyx</h3>
        <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
          <li><a className="underline text-primary" href="https://portal.telnyx.com/#/app/billing/transactions" target="_blank" rel="noreferrer">Billing → Transactions</a> — every top-up and every debit line item.</li>
          <li><a className="underline text-primary" href="https://portal.telnyx.com/#/app/reporting/messaging" target="_blank" rel="noreferrer">Reporting → Messaging</a> — per-message MDRs with cost and destination.</li>
          <li><a className="underline text-primary" href="https://portal.telnyx.com/#/app/numbers/my-numbers" target="_blank" rel="noreferrer">Numbers → My Numbers</a> — monthly number rentals (these debit even with zero SMS).</li>
        </ul>
        <p className="text-xs text-muted-foreground">If Telnyx Transactions shows charges you don't see above, it's almost always number rentals or verification fees — not SMS.</p>
      </Card>
    </div>
  );
}

function SpendBox({ label, v }: { label: string; v: any }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-extrabold tabular-nums mt-1 text-destructive">{v ? formatUSD(v.telnyx_cost) : "—"}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {v ? `${v.messages.toLocaleString()} msg · ${v.segments.toLocaleString()} segments` : "…"}
      </div>
      {v && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Badge variant="secondary">Tenants paid {formatUSD(v.tenant_spend)}</Badge>
          <Badge variant="outline">Profit {formatUSD(v.margin)}</Badge>
        </div>
      )}
    </Card>
  );
}

function BalanceTrend({ snapshots }: { snapshots: Array<{ balance: number; checked_at: string; status: string }> }) {
  if (!snapshots.length) return <div className="text-sm text-muted-foreground">No balance snapshots yet.</div>;
  const points = [...snapshots].reverse();
  const min = Math.min(...points.map((p) => Number(p.balance)));
  const max = Math.max(...points.map((p) => Number(p.balance)));
  const range = Math.max(1, max - min);
  const W = 320, H = 100;
  const path = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * W;
    const y = H - ((Number(p.balance) - min) / range) * H;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Balance (30d)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{formatUSD(Number(points[0].balance))}</span>
        <span>→</span>
        <span>{formatUSD(Number(points[points.length - 1].balance))}</span>
      </div>
    </div>
  );
}

function DailySpend({ rows }: { rows: Array<{ day: string; telnyx_cost: number; segments: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.telnyx_cost));
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Daily Telnyx spend (14d)</div>
      <div className="flex items-end gap-1 h-24">
        {rows.map((r) => (
          <div key={r.day} className="flex-1 flex flex-col items-center gap-1" title={`${r.day}: ${formatUSD(r.telnyx_cost)}`}>
            <div className="w-full bg-destructive/70 rounded-t" style={{ height: `${(r.telnyx_cost / max) * 100}%`, minHeight: r.telnyx_cost > 0 ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{rows[0]?.day.slice(5)}</span>
        <span>{rows[rows.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}
