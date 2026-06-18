import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Settings2, ShieldAlert, ArrowLeft } from "lucide-react";
import { formatRate } from "@/lib/money";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/admin/rates")({
  head: () => ({ meta: [{ title: "Rate management — Samwell Global SMS" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.rpc("has_role", { _role: "admin" });
    if (!data) throw redirect({ to: "/app" });
  },
  component: AdminRatesPage,
});

type Row = {
  id: string; country_code: string; country_name: string; dial_prefix: string;
  cost_price: number; sell_price: number; mms_multiplier: number; active: boolean;
};

function AdminRatesPage() {
  const qc = useQueryClient();
  const ratesQ = useQuery({
    queryKey: ["admin-rates"],
    queryFn: async () => ((await supabase.from("country_rates").select("*").order("country_name")).data ?? []) as Row[],
  });
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});

  const save = useMutation({
    mutationFn: async (row: Row) => {
      const patch = edits[row.id] ?? {};
      const { error } = await supabase.from("country_rates").update(patch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: (_d, row) => {
      toast.success(`${row.country_name} updated`);
      setEdits((e) => { const n = { ...e }; delete n[row.id]; return n; });
      qc.invalidateQueries({ queryKey: ["admin-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("country_rates").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-rates"] }),
  });

  const rows = (ratesQ.data ?? []).filter((r) =>
    !search ||
    r.country_name.toLowerCase().includes(search.toLowerCase()) ||
    r.country_code.toLowerCase().includes(search.toLowerCase()),
  );

  function patch(id: string, p: Partial<Row>) {
    setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? {}), ...p } }));
  }
  function current(row: Row): Row { return { ...row, ...(edits[row.id] ?? {}) } as Row; }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Settings2 className="size-6" /> Rate management</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1"><ShieldAlert className="size-3.5" /> Admin only. Edits apply to all future sends immediately.</p>
        </div>
        <Link to="/app"><Button variant="outline"><ArrowLeft className="size-4 mr-1.5" /> Dashboard</Button></Link>
      </div>

      <Card className="p-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country…" className="max-w-xs" />
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-3">Country</th>
              <th className="text-right p-3">Cost ($)</th>
              <th className="text-right p-3">Sell ($)</th>
              <th className="text-right p-3">Margin</th>
              <th className="text-right p-3">MMS ×</th>
              <th className="text-center p-3">Active</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = current(r);
              const cost = Number(c.cost_price);
              const sell = Number(c.sell_price);
              const margin = +(sell - cost).toFixed(4);
              const marginPct = sell > 0 ? Math.round((margin / sell) * 100) : 0;
              const dirty = !!edits[r.id];
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{r.country_name}</div>
                    <div className="text-xs text-muted-foreground">{r.country_code} · {r.dial_prefix}</div>
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={0.0001} value={c.cost_price} onChange={(e) => patch(r.id, { cost_price: Number(e.target.value) })} className="w-28 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={0.0001} value={c.sell_price} onChange={(e) => patch(r.id, { sell_price: Number(e.target.value) })} className="w-28 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <div className={margin >= 0 ? "text-success" : "text-destructive"}>{formatRate(margin)}</div>
                    <div className="text-xs text-muted-foreground">{marginPct}%</div>
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={0.1} value={c.mms_multiplier} onChange={(e) => patch(r.id, { mms_multiplier: Number(e.target.value) })} className="w-20 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-center">
                    <Switch checked={c.active} onCheckedChange={(v) => toggleActive.mutate({ id: r.id, active: v })} />
                  </td>
                  <td className="p-3 text-right">
                    {dirty ? (
                      <Button size="sm" onClick={() => save.mutate(r)} disabled={save.isPending}>Save</Button>
                    ) : (
                      <Badge variant="outline" className="text-xs">Saved</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
