import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Download, FileDown } from "lucide-react";
import { adminGetCampaignReport } from "@/lib/admin-campaigns.functions";
import { formatUSD } from "@/lib/money";
import { downloadCsv, downloadPdf } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/admin/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campaign report — Admin" }] }),
  component: AdminCampaignReportPage,
});

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
    </Card>
  );
}

function AdminCampaignReportPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(adminGetCampaignReport);
  const q = useQuery({
    queryKey: ["admin", "campaign-report", id],
    queryFn: () => fn({ data: { campaignId: id } }),
    refetchInterval: 20_000,
  });

  if (q.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (q.error || !q.data) {
    return <div className="p-6 text-destructive">Failed to load report: {(q.error as any)?.message ?? "unknown"}</div>;
  }

  const r = q.data;
  const c = r.campaign!;
  const t = r.totals;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/campaigns" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-3" /> All campaigns
        </Link>
        <h1 className="text-2xl font-extrabold mt-2">{c.name}</h1>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center mt-1">
          <span>Tenant: <span className="font-medium text-foreground">{r.account.label}</span></span>
          <span>•</span>
          <span>{r.account.email}</span>
          <span>•</span>
          <Badge variant="outline">{c.status}</Badge>
          <span>•</span>
          <span>{new Date(c.created_at).toLocaleString()}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="text-xs uppercase text-muted-foreground mb-1">Message body</div>
        <div className="text-sm whitespace-pre-wrap">{c.message_body}</div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Recipients" value={t.total.toLocaleString()} />
        <Stat label="Segments" value={t.segments.toLocaleString()} />
        <Stat label="Delivered" value={t.delivered.toLocaleString()} tone="ok" />
        <Stat label="Not delivered" value={t.delivery_unconfirmed.toLocaleString()} tone="warn" />
        <Stat label="Failed" value={t.failed.toLocaleString()} tone="bad" />
        <Stat label="Awaiting" value={(t.awaiting_delivery + t.queued).toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Delivery rate" value={`${t.delivery_rate}%`} tone={t.delivery_rate >= 80 ? "ok" : t.delivery_rate >= 50 ? "warn" : "bad"} />
        <Stat label="Tenant spend" value={formatUSD(t.cost)} />
        <Stat label="Carrier cost" value={formatUSD(t.carrier_cost)} />
        <Stat label="Margin" value={formatUSD(t.margin)} tone={t.margin >= 0 ? "ok" : "bad"} />
      </div>

      <Card className="overflow-hidden">
        <div className="p-3 border-b bg-muted/40 font-semibold text-sm">By country</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left">
              <tr>
                <th className="p-3">Country</th>
                <th className="p-3 text-right">Recipients</th>
                <th className="p-3 text-right">Segments</th>
                <th className="p-3 text-right">Delivered</th>
                <th className="p-3 text-right">Not delivered</th>
                <th className="p-3 text-right">Failed</th>
                <th className="p-3 text-right">Tenant spend</th>
                <th className="p-3 text-right">Carrier cost</th>
                <th className="p-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {r.byCountry.map((row) => (
                <tr key={row.country_code} className="border-t">
                  <td className="p-3 font-mono">{row.country_code}</td>
                  <td className="p-3 text-right tabular-nums">{row.recipients.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{row.segments.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-600">{row.delivered.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums text-amber-600">{row.unconfirmed.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums text-destructive">{row.failed.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{formatUSD(row.cost)}</td>
                  <td className="p-3 text-right tabular-nums">{formatUSD(row.carrier_cost)}</td>
                  <td className="p-3 text-right tabular-nums">{formatUSD(row.margin)}</td>
                </tr>
              ))}
              {r.byCountry.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No data.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {r.bySenderKind.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/40 font-semibold text-sm">By sender type</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left">
                <tr>
                  <th className="p-3">Sender</th>
                  <th className="p-3 text-right">Used</th>
                  <th className="p-3 text-right">Delivered</th>
                  <th className="p-3 text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {r.bySenderKind.map((s) => (
                  <tr key={s.sender_kind} className="border-t">
                    <td className="p-3">{s.sender_kind}</td>
                    <td className="p-3 text-right tabular-nums">{s.used.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600">{s.delivered.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums text-destructive">{s.failed.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {r.failures.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/40 font-semibold text-sm">Failures ({r.failures.length})</div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left sticky top-0">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Country</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {r.failures.map((f, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="p-3 tabular-nums">{f.phone_e164}</td>
                    <td className="p-3">{f.country_code ?? "—"}</td>
                    <td className="p-3 text-xs">{f.error_code ?? "—"}</td>
                    <td className="p-3 text-xs">{f.failure_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">Where to see this on Telnyx</div>
        Log into the Telnyx portal → <span className="font-medium">Reporting → Messaging Detail Records (MDR)</span>. Filter by date range around{" "}
        <span className="font-medium">{new Date(c.created_at).toLocaleString()}</span> and by the messaging profile used for this tenant. Telnyx MDRs show carrier price per message; Xellvio&apos;s "Carrier cost" column above is calculated from your configured country rates and matches what Telnyx bills.
      </Card>
    </div>
  );
}
