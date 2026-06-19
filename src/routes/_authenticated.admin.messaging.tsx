import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";
import { adminListMessages } from "@/lib/admin-overview.functions";
import { formatUSD } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/messaging")({
  head: () => ({ meta: [{ title: "Message monitor — Admin" }] }),
  component: AdminMessagingPage,
});

function AdminMessagingPage() {
  const fn = useServerFn(adminListMessages);
  const q = useQuery({ queryKey: ["admin", "messages-monitor"], queryFn: () => fn() });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    return rows.filter((r: any) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (r.phone_e164 ?? "").toLowerCase().includes(s) ||
        (r.account_label ?? "").toLowerCase().includes(s) ||
        (r.campaign_name ?? "").toLowerCase().includes(s);
    });
  }, [q.data, search, statusFilter]);

  const stats = useMemo(() => {
    const rows = q.data ?? [];
    const total = rows.length;
    const failed = rows.filter((r: any) => r.status === "failed" || r.status === "undelivered").length;
    const delivered = rows.filter((r: any) => r.status === "delivered").length;
    return { total, failed, delivered };
  }, [q.data]);

  const statuses = ["all", "queued", "sent", "delivered", "failed", "undelivered"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><MessageSquareText className="size-6" /> Message monitor</h1>
        <p className="text-sm text-muted-foreground">Latest 200 messages across all tenants.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Sample</div><div className="text-2xl font-extrabold">{stats.total}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Delivered</div><div className="text-2xl font-extrabold text-emerald-600">{stats.delivered}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Failed</div><div className="text-2xl font-extrabold text-destructive">{stats.failed}</div></Card>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, tenant…" className="max-w-xs" />
        <div className="flex gap-1 flex-wrap">
          {statuses.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1 rounded-md border ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
      </Card>

      {q.isLoading ? (
        <div className="flex justify-center h-32 items-center"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Tenant</th>
                  <th className="p-3">Campaign</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Country</th>
                  <th className="p-3 text-right">Cost</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m: any) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="p-3 truncate max-w-[180px]">{m.account_label}</td>
                    <td className="p-3 truncate max-w-[160px] text-muted-foreground">{m.campaign_name ?? "—"}</td>
                    <td className="p-3 tabular-nums">{m.phone_e164}</td>
                    <td className="p-3">{m.country_code ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{m.cost ? formatUSD(Number(m.cost)) : "—"}</td>
                    <td className="p-3"><Badge variant={m.status === "delivered" ? "default" : m.status === "failed" || m.status === "undelivered" ? "destructive" : "secondary"}>{m.status}</Badge></td>
                    <td className="p-3 text-xs text-destructive">{m.error_code ?? ""}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No messages match.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
