import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaignReport, type CampaignReport } from "@/lib/reports.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUSD } from "@/lib/money";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { ArrowLeft, Download, CheckCircle2, XCircle, Clock, DollarSign, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns/$id/report")({
  head: () => ({ meta: [{ title: "Campaign report — Xellvio" }] }),
  component: ReportPage,
  errorComponent: ({ error }) => (
    <div className="p-8"><div className="text-destructive font-semibold">Report failed to load</div><div className="text-sm text-muted-foreground mt-2">{error.message}</div></div>
  ),
  notFoundComponent: () => <div className="p-8">Campaign not found.</div>,
});

function ReportPage() {
  const { id } = useParams({ from: "/_authenticated/app/campaigns/$id/report" });
  const call = useServerFn(getCampaignReport);
  const q = useQuery<CampaignReport>({
    queryKey: ["campaign-report", id],
    queryFn: () => call({ data: { campaignId: id } }),
    refetchInterval: 15000,
  });

  const r = q.data;

  function exportFailuresCsv() {
    if (!r) return;
    const rows = [["phone_e164", "country_code", "error_code", "failure_reason", "created_at"]];
    for (const f of r.failures) {
      rows.push([f.phone_e164, f.country_code ?? "", f.error_code ?? "", (f.failure_reason ?? "").replace(/"/g, "'"), f.created_at]);
    }
    const csv = rows.map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${id}-failures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (q.isLoading) return <div className="p-8 text-muted-foreground">Loading report…</div>;
  if (!r) return <div className="p-8 text-muted-foreground">No data.</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <Link to="/app/campaigns"><Button variant="ghost" size="sm"><ArrowLeft className="size-4 mr-1" />Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{r.campaign?.name ?? "Campaign"}</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Badge variant="outline">{r.campaign?.status}</Badge>
            <span>Sent {r.campaign ? new Date(r.campaign.created_at).toLocaleString() : ""}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Send className="size-4" />} label="Sent" value={r.totals.sent.toLocaleString()} />
        <Stat icon={<CheckCircle2 className="size-4 text-green-600" />} label="Delivered" value={r.totals.delivered.toLocaleString()} sub={`${r.totals.delivery_rate}%`} />
        <Stat icon={<XCircle className="size-4 text-destructive" />} label="Failed" value={r.totals.failed.toLocaleString()} />
        <Stat icon={<Clock className="size-4 text-amber-600" />} label="Queued" value={r.totals.queued.toLocaleString()} />
        <Stat icon={<DollarSign className="size-4" />} label="Cost" value={formatUSD(r.totals.cost)} />
      </div>

      {r.timeline.length > 0 && (
        <Card className="p-4">
          <div className="font-semibold mb-3">Delivery over time</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.timeline.map((t) => ({ ...t, hour: new Date(t.hour).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="delivered" stackId="a" fill="hsl(var(--primary))" />
              <Bar dataKey="failed" stackId="a" fill="hsl(var(--destructive))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-semibold mb-3">By country</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr><th className="text-left py-1.5">Country</th><th className="text-right">Recipients</th><th className="text-right">Delivered</th><th className="text-right">Failed</th><th className="text-right">Cost</th></tr>
            </thead>
            <tbody>
              {r.byCountry.map((c) => (
                <tr key={c.country_code} className="border-t">
                  <td className="py-1.5">{c.country_code}</td>
                  <td className="text-right">{c.recipients.toLocaleString()}</td>
                  <td className="text-right text-green-700">{c.delivered.toLocaleString()}</td>
                  <td className="text-right text-destructive">{c.failed.toLocaleString()}</td>
                  <td className="text-right">{formatUSD(c.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-4">
          <div className="font-semibold mb-3">By sender kind</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr><th className="text-left py-1.5">Kind</th><th className="text-right">Used</th><th className="text-right">Delivered</th><th className="text-right">Failed</th></tr>
            </thead>
            <tbody>
              {r.bySenderKind.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No sender data yet</td></tr>
              )}
              {r.bySenderKind.map((k) => (
                <tr key={k.sender_kind} className="border-t">
                  <td className="py-1.5 capitalize">{k.sender_kind.replace("_", " ")}</td>
                  <td className="text-right">{k.used.toLocaleString()}</td>
                  <td className="text-right text-green-700">{k.delivered.toLocaleString()}</td>
                  <td className="text-right text-destructive">{k.failed.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Failed numbers ({r.failures.length})</div>
          {r.failures.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportFailuresCsv}><Download className="size-4 mr-1" />Export CSV</Button>
          )}
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase sticky top-0 bg-background">
              <tr><th className="text-left py-1.5">Phone</th><th className="text-left">Country</th><th className="text-left">Code</th><th className="text-left">Reason</th></tr>
            </thead>
            <tbody>
              {r.failures.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No failures — 🎉</td></tr>
              )}
              {r.failures.map((f, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1.5 font-mono text-xs">{f.phone_e164}</td>
                  <td>{f.country_code ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{f.error_code ?? "—"}</td>
                  <td className="text-xs">{f.failure_reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
