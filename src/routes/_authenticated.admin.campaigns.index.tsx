import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Megaphone, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { adminListCampaigns } from "@/lib/admin-campaigns.functions";
import { formatUSD } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — Admin" }] }),
  component: AdminCampaignsPage,
});

function AdminCampaignsPage() {
  const fn = useServerFn(adminListCampaigns);
  const q = useQuery({ queryKey: ["admin", "campaigns"], queryFn: () => fn(), refetchInterval: 30_000 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const rows = useMemo(() => {
    const all = (q.data ?? []) as any[];
    return all.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (r.name ?? "").toLowerCase().includes(s) ||
        (r.account_label ?? "").toLowerCase().includes(s) ||
        (r.account_email ?? "").toLowerCase().includes(s);
    });
  }, [q.data, search, statusFilter]);

  const statuses = ["all", "draft", "scheduled", "sending", "sent", "completed", "paused", "blocked_content"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Megaphone className="size-6" /> Campaigns</h1>
        <p className="text-sm text-muted-foreground">Every campaign a tenant sent. Click one to see full delivery report, per-country cost, and failures.</p>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaign or tenant…" className="max-w-xs" />
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
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Recipients</th>
                  <th className="p-3 text-right">Delivered</th>
                  <th className="p-3 text-right">Failed</th>
                  <th className="p-3 text-right">Rate</th>
                  <th className="p-3 text-right">Spend</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="font-medium">{c.account_label}</div>
                      <div className="text-xs text-muted-foreground">{c.account_email}</div>
                    </td>
                    <td className="p-3 max-w-[280px]">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.message_body}</div>
                    </td>
                    <td className="p-3"><Badge variant="outline">{c.status}</Badge></td>
                    <td className="p-3 text-right tabular-nums">{c.total.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600">{c.delivered.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums text-destructive">{c.failed.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums">{c.delivery_rate}%</td>
                    <td className="p-3 text-right tabular-nums">{formatUSD(Number(c.cost ?? 0))}</td>
                    <td className="p-3">
                      <Link to="/admin/campaigns/$id" params={{ id: c.id }} className="text-primary text-xs inline-flex items-center gap-1 hover:underline">
                        Report <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No campaigns match.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
