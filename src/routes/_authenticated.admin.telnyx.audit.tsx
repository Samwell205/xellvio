import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileDown, Trash2, Scale } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getBalanceDropAudit, importTelnyxTransactionsCsv, listImportedTransactionBatches, deleteImportBatch } from "@/lib/admin-telnyx-audit.functions";
import { formatUSD } from "@/lib/money";
import { downloadCsv, downloadPdf } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/admin/telnyx/audit")({
  head: () => ({ meta: [{ title: "Balance-drop audit — Admin" }] }),
  component: BalanceDropAuditPage,
});

function toIso(d: Date) { return d.toISOString(); }

function BalanceDropAuditPage() {
  const now = new Date();
  const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const [start, setStart] = useState(past.toISOString().slice(0, 10));
  const [end, setEnd] = useState(now.toISOString().slice(0, 10));

  const auditFn = useServerFn(getBalanceDropAudit);
  const listFn = useServerFn(listImportedTransactionBatches);
  const importFn = useServerFn(importTelnyxTransactionsCsv);
  const deleteFn = useServerFn(deleteImportBatch);
  const qc = useQueryClient();

  const audit = useQuery({
    queryKey: ["admin", "telnyx-audit", start, end],
    queryFn: () => auditFn({ data: { start: toIso(new Date(start)), end: toIso(new Date(new Date(end).getTime() + 24 * 3600 * 1000 - 1)) } }),
  });
  const batches = useQuery({ queryKey: ["admin", "telnyx-import-batches"], queryFn: () => listFn() });

  const importMut = useMutation({
    mutationFn: (rows: any[]) => importFn({ data: { rows } }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted} rows`);
      qc.invalidateQueries({ queryKey: ["admin", "telnyx-audit"] });
      qc.invalidateQueries({ queryKey: ["admin", "telnyx-import-batches"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (batch_id: string) => deleteFn({ data: { batch_id } }),
    onSuccess: () => {
      toast.success("Batch deleted");
      qc.invalidateQueries({ queryKey: ["admin", "telnyx-audit"] });
      qc.invalidateQueries({ queryKey: ["admin", "telnyx-import-batches"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  async function handleFile(file: File) {
    const text = await file.text();
    const rows = parseTelnyxCsv(text);
    if (rows.length === 0) { toast.error("No rows detected. Expected columns: date/created_at, amount, category, description"); return; }
    importMut.mutate(rows);
  }

  const a = audit.data;
  const outflowSummary = useMemo(() => {
    if (!a) return null;
    return [
      { label: "SMS / MDR (derived)", amount: a.derived.sms_cost, note: `${a.derived.sms_messages.toLocaleString()} msgs · ${a.derived.sms_segments.toLocaleString()} segs` },
      { label: "Toll-free verifications (derived)", amount: a.derived.verification_fees, note: `${a.derived.verifications} attempts × $75` },
      { label: "Imported Telnyx debits", amount: a.imported.total_debits, note: `${(a.imported.rows as any[]).filter((r) => Number(r.amount) < 0).length} rows` },
    ];
  }, [a]);

  function exportAuditPdf() {
    if (!a) return;
    downloadPdf({
      filename: `telnyx-audit-${start}_${end}.pdf`,
      title: "Telnyx balance-drop audit",
      subtitle: `${start} → ${end}`,
      sections: [
        { type: "kv", title: "Balance snapshots", items: [
          ["First snapshot", a.snapshots.first ? `${formatUSD(Number(a.snapshots.first.balance))} on ${new Date(a.snapshots.first.checked_at).toLocaleString()}` : "—"],
          ["Last snapshot", a.snapshots.last ? `${formatUSD(Number(a.snapshots.last.balance))} on ${new Date(a.snapshots.last.checked_at).toLocaleString()}` : "—"],
          ["Balance delta", a.snapshots.delta === null ? "—" : formatUSD(a.snapshots.delta)],
          ["Observed outflow", a.snapshots.observed_outflow === null ? "—" : formatUSD(a.snapshots.observed_outflow)],
        ] },
        { type: "kv", title: "Derived outflow", items: [
          ["SMS / MDR", formatUSD(a.derived.sms_cost)],
          ["Toll-free verifications", formatUSD(a.derived.verification_fees)],
          ["Total derived", formatUSD(a.derived.total_derived_outflow)],
        ] },
        { type: "kv", title: "Imported Telnyx transactions", items: [
          ["Debits", formatUSD(a.imported.total_debits)],
          ["Credits", formatUSD(a.imported.total_credits)],
        ] },
        { type: "kv", title: "Reconciliation", items: [
          ["Unexplained (observed − derived)", a.unexplained === null ? "—" : formatUSD(a.unexplained)],
        ] },
        ...(a.imported.by_category.length > 0 ? [{
          type: "table" as const, title: "By category (imported)", head: ["Category", "Rows", "Amount"],
          rows: a.imported.by_category.map((c) => [c.category, c.count, formatUSD(c.amount)]),
        }] : []),
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Scale className="size-6" /> Balance-drop audit</h1>
        <p className="text-sm text-muted-foreground">Explains what caused Telnyx's balance to move in the selected window. Combines derived SMS/MDR + verification fees with any Transactions CSV you upload.</p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Start</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">End</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => audit.refetch()}>Refresh</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportAuditPdf} disabled={!a}><FileDown className="size-4 mr-1" />Export PDF</Button>
        </div>
      </Card>

      {audit.isLoading ? (
        <div className="flex justify-center h-32 items-center"><Loader2 className="size-6 animate-spin" /></div>
      ) : audit.isError ? (
        <Card className="p-4 text-destructive">{(audit.error as any)?.message}</Card>
      ) : a ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat label="Observed balance outflow" value={a.snapshots.observed_outflow === null ? "—" : formatUSD(a.snapshots.observed_outflow)} tone="warn" />
            <Stat label="Explained (derived + imported)" value={formatUSD(a.derived.total_derived_outflow + a.imported.total_debits)} tone="ok" />
            <Stat label="Unexplained gap" value={a.unexplained === null ? "—" : formatUSD(a.unexplained)} tone={a.unexplained !== null && Math.abs(a.unexplained) > 5 ? "bad" : "ok"} />
          </div>

          <Card className="overflow-hidden">
            <div className="p-3 border-b bg-muted/40 font-semibold text-sm">Outflow breakdown</div>
            <table className="w-full text-sm">
              <thead className="text-left bg-muted/30">
                <tr>
                  <th className="p-3">Source</th>
                  <th className="p-3">Detail</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {outflowSummary?.map((s) => (
                  <tr key={s.label} className="border-t">
                    <td className="p-3 font-medium">{s.label}</td>
                    <td className="p-3 text-xs text-muted-foreground">{s.note}</td>
                    <td className="p-3 text-right tabular-nums">{formatUSD(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="overflow-hidden">
              <div className="p-3 border-b bg-muted/40 font-semibold text-sm">SMS spend by sender kind</div>
              <table className="w-full text-sm">
                <thead className="text-left bg-muted/30"><tr><th className="p-3">Kind</th><th className="p-3 text-right">Msgs</th><th className="p-3 text-right">Segs</th><th className="p-3 text-right">Cost</th></tr></thead>
                <tbody>
                  {a.derived.by_sender_kind.map((k) => (
                    <tr key={k.kind} className="border-t"><td className="p-3 capitalize">{k.kind.replace("_", " ")}</td><td className="p-3 text-right tabular-nums">{k.count.toLocaleString()}</td><td className="p-3 text-right tabular-nums">{k.segments.toLocaleString()}</td><td className="p-3 text-right tabular-nums">{formatUSD(k.cost)}</td></tr>
                  ))}
                  {a.derived.by_sender_kind.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No SMS in this window.</td></tr>}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-hidden">
              <div className="p-3 border-b bg-muted/40 font-semibold text-sm">Imported transactions by category</div>
              <table className="w-full text-sm">
                <thead className="text-left bg-muted/30"><tr><th className="p-3">Category</th><th className="p-3 text-right">Rows</th><th className="p-3 text-right">Amount</th></tr></thead>
                <tbody>
                  {a.imported.by_category.map((c) => (
                    <tr key={c.category} className="border-t"><td className="p-3">{c.category}</td><td className="p-3 text-right tabular-nums">{c.count}</td><td className="p-3 text-right tabular-nums">{formatUSD(c.amount)}</td></tr>
                  ))}
                  {a.imported.by_category.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Nothing imported for this window. Upload a Telnyx CSV below.</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      ) : null}

      <Card className="p-4 space-y-3">
        <div className="font-semibold flex items-center gap-2"><Upload className="size-4" /> Import Telnyx Transactions CSV</div>
        <p className="text-xs text-muted-foreground">
          Export from Telnyx Portal → <b>Billing → Transactions</b> as CSV, then upload here. The importer maps common column names (<i>Date/Created At</i>, <i>Amount</i>, <i>Category/Type</i>, <i>Description</i>, <i>Reference/ID</i>).
        </p>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={importMut.isPending} />
        {importMut.isPending && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> Uploading…</div>}

        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-1">Imported batches</div>
          {batches.isLoading ? <Loader2 className="size-4 animate-spin" /> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Batch</th><th className="text-left">When</th><th className="text-right">Rows</th><th></th></tr></thead>
              <tbody>
                {(batches.data ?? []).map((b) => (
                  <tr key={b.batch_id} className="border-t">
                    <td className="py-1 font-mono text-[11px]">{b.batch_id.slice(0, 8)}…</td>
                    <td className="text-muted-foreground">{new Date(b.created_at).toLocaleString()}</td>
                    <td className="text-right tabular-nums">{b.rows}</td>
                    <td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => confirm("Delete this batch?") && deleteMut.mutate(b.batch_id)}><Trash2 className="size-3" /></Button>
                    </td>
                  </tr>
                ))}
                {(batches.data ?? []).length === 0 && <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">No batches imported yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</div>
    </Card>
  );
}

/** Very forgiving CSV parser: finds date/amount/category/description columns. */
function parseTelnyxCsv(text: string): Array<{ occurred_at: string; amount: number; category: string | null; description: string | null; reference: string | null; raw: any }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const dateI = idx(["date", "created_at", "created at", "timestamp", "occurred_at"]);
  const amtI = idx(["amount", "amount_usd", "value", "total"]);
  const catI = idx(["category", "type", "product", "record_type"]);
  const descI = idx(["description", "details", "memo", "notes"]);
  const refI = idx(["id", "reference", "record_id", "transaction_id"]);
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length === 0) continue;
    const raw: Record<string, string> = {};
    header.forEach((h, j) => (raw[h] = cols[j] ?? ""));
    const dateStr = dateI >= 0 ? cols[dateI] : "";
    const amountStr = amtI >= 0 ? cols[amtI] : "";
    const d = new Date(dateStr);
    const amt = parseFloat(amountStr.replace(/[$,]/g, ""));
    if (isNaN(d.getTime()) || isNaN(amt)) continue;
    rows.push({
      occurred_at: d.toISOString(),
      amount: amt,
      category: catI >= 0 ? cols[catI] || null : null,
      description: descI >= 0 ? cols[descI] || null : null,
      reference: refI >= 0 ? cols[refI] || null : null,
      raw,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
