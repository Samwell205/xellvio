import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, FileDown, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { listSenderNumbers, getSenderNumberActivity } from "@/lib/admin-telnyx-audit.functions";
import { formatUSD } from "@/lib/money";
import { downloadCsv, downloadPdf } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/admin/telnyx/tfn")({
  head: () => ({ meta: [{ title: "Number activity — Admin" }] }),
  component: TfnActivityPage,
});

function TfnActivityPage() {
  const listFn = useServerFn(listSenderNumbers);
  const activityFn = useServerFn(getSenderNumberActivity);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "toll_free" | "local" | "sender_id">("toll_free");

  const numbers = useQuery({ queryKey: ["admin", "sender-numbers"], queryFn: () => listFn() });
  const activity = useQuery({
    queryKey: ["admin", "sender-activity", selected],
    queryFn: () => activityFn({ data: { phone_number: selected! } }),
    enabled: !!selected,
  });

  const filteredNumbers = useMemo(() => {
    const all = (numbers.data ?? []) as any[];
    return all.filter((n) => {
      if (kindFilter !== "all" && n.sender_kind !== kindFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (n.phone_number ?? "").toLowerCase().includes(s) || (n.account_label ?? "").toLowerCase().includes(s);
    });
  }, [numbers.data, search, kindFilter]);

  function exportActivityCsv() {
    if (!activity.data || !selected) return;
    downloadCsv(
      `sender-${selected.replace(/\D/g, "")}-activity.csv`,
      ["created_at", "campaign", "to_phone", "country", "segments", "status", "telnyx_mdr_cost_usd", "tenant_cost_usd", "error_code", "failure_reason", "provider_message_id"],
      activity.data.rows.map((r: any) => [r.created_at, r.campaign_name, r.phone_e164, r.country_code ?? "", r.segments_count ?? 1, r.status, r.mdr_cost, r.cost ?? 0, r.error_code ?? "", r.failure_reason ?? "", r.provider_message_id ?? ""]),
    );
  }

  function exportActivityPdf() {
    if (!activity.data || !selected) return;
    const t = activity.data.totals;
    downloadPdf({
      filename: `sender-${selected.replace(/\D/g, "")}-summary.pdf`,
      title: `Number activity — ${selected}`,
      subtitle: `All-time SMS sent from this number`,
      sections: [
        { type: "kv", title: "Totals", items: [
          ["Messages", t.messages.toLocaleString()],
          ["Segments", t.segments.toLocaleString()],
          ["Delivered", t.delivered.toLocaleString()],
          ["Failed", t.failed.toLocaleString()],
          ["Not delivered", t.unconfirmed.toLocaleString()],
          ["Telnyx MDR cost", formatUSD(t.carrier_cost)],
          ["Tenant spend", formatUSD(t.tenant_spend)],
          ["Margin", formatUSD(t.margin)],
        ] },
        { type: "table", title: "By status", head: ["Status", "Count"], rows: t.by_status.map((s: any) => [s.status, s.count]) },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Phone className="size-6" /> Number activity</h1>
        <p className="text-sm text-muted-foreground">Pick a toll-free (or any) number to see every SMS ever sent from it with its status and Telnyx MDR cost.</p>
      </div>

      <div className="grid md:grid-cols-[340px_1fr] gap-4">
        <Card className="p-3 space-y-2 h-fit">
          <div className="flex gap-1 text-xs">
            {(["toll_free", "local", "sender_id", "all"] as const).map((k) => (
              <button key={k} onClick={() => setKindFilter(k)} className={`px-2 py-1 rounded border ${kindFilter === k ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>{k.replace("_", " ")}</button>
            ))}
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or tenant…" />
          <div className="max-h-[600px] overflow-y-auto -mx-1">
            {numbers.isLoading ? <Loader2 className="size-5 animate-spin mx-auto my-4" /> : filteredNumbers.map((n) => (
              <button
                key={n.phone_number + n.account_id}
                onClick={() => setSelected(n.phone_number)}
                className={`w-full text-left px-2 py-2 rounded-md border-b hover:bg-muted ${selected === n.phone_number ? "bg-primary/10 border-primary/30" : ""}`}
              >
                <div className="font-mono text-sm">{n.phone_number}</div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] py-0">{n.sender_kind.replace("_", " ")}</Badge>
                  <span>{n.account_label}</span>
                </div>
              </button>
            ))}
            {!numbers.isLoading && filteredNumbers.length === 0 && <div className="text-sm text-muted-foreground p-3">No numbers match.</div>}
          </div>
        </Card>

        <div className="min-w-0">
          {!selected ? (
            <Card className="p-8 text-center text-muted-foreground">Select a number to view activity.</Card>
          ) : activity.isLoading ? (
            <div className="flex justify-center h-32 items-center"><Loader2 className="size-6 animate-spin" /></div>
          ) : activity.data ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Number</div>
                  <div className="font-mono text-xl">{selected}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportActivityCsv}><FileDown className="size-4 mr-1" />CSV</Button>
                  <Button variant="outline" size="sm" onClick={exportActivityPdf}><Download className="size-4 mr-1" />PDF</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TotalCard label="Messages" value={activity.data.totals.messages.toLocaleString()} />
                <TotalCard label="Segments" value={activity.data.totals.segments.toLocaleString()} />
                <TotalCard label="Telnyx MDR cost" value={formatUSD(activity.data.totals.carrier_cost)} />
                <TotalCard label="Margin" value={formatUSD(activity.data.totals.margin)} tone={activity.data.totals.margin >= 0 ? "ok" : "bad"} />
              </div>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left sticky top-0">
                      <tr>
                        <th className="p-3">When</th>
                        <th className="p-3">Campaign</th>
                        <th className="p-3">To</th>
                        <th className="p-3">Country</th>
                        <th className="p-3 text-right">Segs</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">MDR</th>
                        <th className="p-3 text-right">Tenant $</th>
                        <th className="p-3">Provider ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.data.rows.map((r: any) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="p-2 max-w-[180px] truncate">{r.campaign_name}</td>
                          <td className="p-2 font-mono text-xs">{r.phone_e164}</td>
                          <td className="p-2 font-mono text-xs">{r.country_code ?? "—"}</td>
                          <td className="p-2 text-right tabular-nums">{r.segments_count ?? 1}</td>
                          <td className="p-2"><StatusBadge s={r.status} /></td>
                          <td className="p-2 text-right tabular-nums">{formatUSD(Number(r.mdr_cost ?? 0))}</td>
                          <td className="p-2 text-right tabular-nums">{formatUSD(Number(r.cost ?? 0))}</td>
                          <td className="p-2 font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">{r.provider_message_id ?? "—"}</td>
                        </tr>
                      ))}
                      {activity.data.rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No messages ever sent from this number.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-3 text-xs text-muted-foreground">
                Cross-check on Telnyx: <b>Reporting → Messaging Detail Records (MDR)</b>, then filter <b>From</b> = <span className="font-mono">{selected}</span>. Amounts above use your configured <i>country_rates.cost_price</i> per segment.
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TotalCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-xl font-extrabold mt-1 ${color}`}>{value}</div>
    </Card>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    delivered: "bg-emerald-100 text-emerald-700",
    sent: "bg-sky-100 text-sky-700",
    delivery_unconfirmed: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    undelivered: "bg-red-100 text-red-700",
    queued: "bg-slate-100 text-slate-700",
    sending: "bg-slate-100 text-slate-700",
    pending: "bg-slate-100 text-slate-700",
  };
  return <span className={`px-2 py-0.5 text-[11px] rounded ${map[s] ?? "bg-muted"}`}>{s}</span>;
}
