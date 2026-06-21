import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Settings2, ShieldAlert, ArrowLeft, RefreshCw, Lock } from "lucide-react";
import { formatRate } from "@/lib/money";
import { useState } from "react";
import { toast } from "sonner";
import {
  syncTwilioPricing,
  setDefaultMarkup,
  getDefaultMarkup,
} from "@/lib/twilio-pricing.functions";



export const Route = createFileRoute("/_authenticated/admin/rates")({
  head: () => ({ meta: [{ title: "Rate management — Xellvio" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.rpc("has_role", { _role: "admin" });
    if (!data) throw redirect({ to: "/app" });
  },
  component: AdminRatesPage,
});

type Row = {
  id: string;
  country_code: string;
  country_name: string;
  dial_prefix: string;
  cost_price: number;
  sell_price: number;
  mms_multiplier: number;
  active: boolean;
  markup_percent: number;
  manual_override: boolean;
  number_type_used: string | null;
  last_synced_at: string | null;
};

function AdminRatesPage() {


  const qc = useQueryClient();
  const syncFn = useServerFn(syncTwilioPricing);
  const setMarkupFn = useServerFn(setDefaultMarkup);
  const getMarkupFn = useServerFn(getDefaultMarkup);

  const ratesQ = useQuery({
    queryKey: ["admin-rates"],
    queryFn: async () =>
      ((await supabase.from("country_rates").select("*").order("country_name")).data ?? []) as Row[],
  });

  const markupQ = useQuery({
    queryKey: ["default-markup"],
    queryFn: async () => await getMarkupFn(),
  });

  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});
  const [markupDraft, setMarkupDraft] = useState<string>("");

  const save = useMutation({
    mutationFn: async (row: Row) => {
      const patch = edits[row.id] ?? {};
      // Any manual edit to price/markup flips manual_override on
      const flips =
        patch.cost_price !== undefined ||
        patch.sell_price !== undefined ||
        patch.markup_percent !== undefined;
      const finalPatch = flips ? { ...patch, manual_override: true } : patch;
      const { error } = await supabase.from("country_rates").update(finalPatch).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: (_d, row) => {
      toast.success(`${row.country_name} updated`);
      setEdits((e) => { const n = { ...e }; delete n[row.id]; return n; });
      qc.invalidateQueries({ queryKey: ["admin-rates"] });
      qc.invalidateQueries({ queryKey: ["country-rates-all"] });
      qc.invalidateQueries({ queryKey: ["public-country-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("country_rates").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rates"] });
      qc.invalidateQueries({ queryKey: ["country-rates-all"] });
      qc.invalidateQueries({ queryKey: ["public-country-rates"] });
    },
  });

  const toggleOverride = useMutation({
    mutationFn: async ({ id, manual_override }: { id: string; manual_override: boolean }) => {
      const { error } = await supabase.from("country_rates").update({ manual_override }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rates"] });
      qc.invalidateQueries({ queryKey: ["country-rates-all"] });
      qc.invalidateQueries({ queryKey: ["public-country-rates"] });
    },
  });

  const sync = useMutation({
    mutationFn: async () => await syncFn(),
    onSuccess: (r: any) => {
      toast.success(`Synced ${r.updated} · skipped ${r.skipped} · errors ${r.errors}`);
      qc.invalidateQueries({ queryKey: ["admin-rates"] });
      qc.invalidateQueries({ queryKey: ["country-rates-all"] });
      qc.invalidateQueries({ queryKey: ["public-country-rates"] });
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });

  const saveMarkup = useMutation({
    mutationFn: async (percent: number) => await setMarkupFn({ data: { percent } }),
    onSuccess: () => {
      toast.success("Default markup updated and active country sell prices recalculated.");
      qc.invalidateQueries({ queryKey: ["default-markup"] });
      qc.invalidateQueries({ queryKey: ["admin-rates"] });
      qc.invalidateQueries({ queryKey: ["country-rates-all"] });
      qc.invalidateQueries({ queryKey: ["public-country-rates"] });
      setMarkupDraft("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (ratesQ.data ?? []).filter((r) =>
    !search ||
    r.country_name.toLowerCase().includes(search.toLowerCase()) ||
    r.country_code.toLowerCase().includes(search.toLowerCase()),
  );

  function calculateSell(cost: number, markup: number) {
    if (!Number.isFinite(cost) || !Number.isFinite(markup)) return 0;
    return Math.round(cost * (1 + markup / 100) * 10000) / 10000;
  }
  function patch(id: string, p: Partial<Row>) {
    setEdits((e) => {
      const base = ratesQ.data?.find((row) => row.id === id);
      const next = { ...(e[id] ?? {}), ...p };
      if ((p.cost_price !== undefined || p.markup_percent !== undefined) && base) {
        const cost = Number(next.cost_price ?? base.cost_price);
        const markup = Number(next.markup_percent ?? base.markup_percent ?? markupQ.data?.percent ?? 40);
        next.sell_price = calculateSell(cost, markup);
      }
      return { ...e, [id]: next };
    });
  }
  function current(row: Row): Row { return { ...row, ...(edits[row.id] ?? {}) } as Row; }

  const currentMarkup = markupDraft !== "" ? Number(markupDraft) : (markupQ.data?.percent ?? 50);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><Settings2 className="size-6" /> Rate management</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1"><ShieldAlert className="size-3.5" /> Admin only. Edits apply to all future sends immediately.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`size-4 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing…" : "Refresh Twilio pricing"}
          </Button>
          <Link to="/app"><Button variant="outline"><ArrowLeft className="size-4 mr-1.5" /> Dashboard</Button></Link>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Default markup %</div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step={1}
              min={0}
              className="w-28 tabular-nums"
              value={markupDraft !== "" ? markupDraft : (markupQ.data?.percent ?? 50)}
              onChange={(e) => setMarkupDraft(e.target.value)}
            />
            <Button
              size="sm"
              disabled={saveMarkup.isPending || markupDraft === "" || Number(markupDraft) === markupQ.data?.percent}
              onClick={() => saveMarkup.mutate(Number(markupDraft))}
            >Save</Button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            sell_price = cost × (1 + {currentMarkup}/100) for non-overridden countries.
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country…" className="max-w-xs" />
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-3">Country</th>
              <th className="text-right p-3">Cost ($)</th>
              <th className="text-right p-3">Markup %</th>
              <th className="text-right p-3">Sell ($)</th>
              <th className="text-right p-3">Margin</th>
              <th className="text-right p-3">MMS ×</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Last sync</th>
              <th className="text-center p-3">Override</th>
              <th className="text-center p-3">Active</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = current(r);
              const cost = Number(c.cost_price);
              const sell = Number(c.sell_price);
              const margin = +(sell - cost).toFixed(5);
              const marginPct = sell > 0 ? Math.round((margin / sell) * 100) : 0;
              const dirty = !!edits[r.id];
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium flex items-center gap-1.5">
                      {r.country_name}
                      {c.manual_override && <Lock className="size-3 text-muted-foreground" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.country_code} · {r.dial_prefix}</div>
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={0.00001} value={c.cost_price} onChange={(e) => patch(r.id, { cost_price: Number(e.target.value) })} className="w-28 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={1} value={c.markup_percent ?? 50} onChange={(e) => patch(r.id, { markup_percent: Number(e.target.value) })} className="w-20 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={0.00001} value={c.sell_price} onChange={(e) => patch(r.id, { sell_price: Number(e.target.value) })} className="w-28 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <div className={margin >= 0 ? "text-success" : "text-destructive"}>{formatRate(margin)}</div>
                    <div className="text-xs text-muted-foreground">{marginPct}%</div>
                  </td>
                  <td className="p-3 text-right">
                    <Input type="number" step={0.1} value={c.mms_multiplier} onChange={(e) => patch(r.id, { mms_multiplier: Number(e.target.value) })} className="w-20 text-right tabular-nums ml-auto" />
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.number_type_used ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3 text-center">
                    <Switch checked={c.manual_override} onCheckedChange={(v) => toggleOverride.mutate({ id: r.id, manual_override: v })} />
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
