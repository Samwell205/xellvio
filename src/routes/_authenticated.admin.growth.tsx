import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  growthOverview,
  growthSaveConfig,
  growthSaveExperiment,
  growthDeleteExperiment,
  growthSaveAlert,
  growthDeleteAlert,
  growthAsk,
} from "@/lib/growth-intel.functions";
import {
  ACTIVATION_EVENTS,
  EXPERIMENT_SAFETY,
  PRIVACY_RULES,
  REVIEW_WORKFLOW,
} from "@/lib/growth/taxonomy";

export const Route = createFileRoute("/_authenticated/admin/growth")({
  head: () => ({ meta: [{ title: "Growth intelligence — Xellvio admin" }] }),
  component: GrowthPage,
});

const WINDOWS = [7, 30, 90] as const;

function pct(v: number | null) {
  return v === null ? "—" : `${v}%`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((cell, j) => (
                <TableCell key={j} className="whitespace-nowrap text-sm">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function GrowthPage() {
  const [days, setDays] = useState<number>(30);
  const overviewFn = useServerFn(growthOverview);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["growth-overview", days],
    queryFn: () => overviewFn({ data: { days } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Reading measured data…
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">Could not load growth data: {(error as Error)?.message}</p>;
  }

  const d = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Growth intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Visitor → signup → activation → revenue, measured from real events and real product activity.
            Percentages stay hidden until at least {d.min_sample} people reach a stage.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Button key={w} size="sm" variant={days === w ? "default" : "outline"} onClick={() => setDays(w)}>
              {w}d
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="journeys">Journeys</TabsTrigger>
          <TabsTrigger value="pages">Pages & CTAs</TabsTrigger>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="activation">Activation</TabsTrigger>
          <TabsTrigger value="product">Product</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
          <TabsTrigger value="insights">Insights & AI</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ---------------- executive overview ---------------- */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Visitors" value={d.funnel[0]?.count ?? 0} hint={`last ${d.window_days} days`} />
            <Stat label="New signups" value={d.activation.new_users} />
            <Stat label="Activated" value={d.activation.activated_users} hint={pct(d.activation.activation_rate)} />
            <Stat label="Paying customers" value={d.funnel[9]?.count ?? 0} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={d.northStar.label} value={d.northStar.value} hint={d.northStar.definition.join(", ")} />
            <Stat
              label="Median time to first value"
              value={d.activation.median_hours_to_activation === null ? "—" : `${d.activation.median_hours_to_activation}h`}
            />
            <Stat label="Active workspaces" value={d.funnel[8]?.count ?? 0} />
            <Stat label="Events recorded" value={d.events_recorded} hint="visitor + product events in window" />
          </div>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Trend vs previous period</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {d.trends.map((t) => (
                <div key={t.metric} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{t.metric}</div>
                  <div className="text-lg font-semibold">{t.now}</div>
                  <div className="text-xs flex items-center gap-1">
                    {t.change_pct === null ? (
                      <span className="text-muted-foreground">no earlier data</span>
                    ) : (
                      <>
                        {t.change_pct >= 0 ? (
                          <TrendingUp className="size-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="size-3 text-destructive" />
                        )}
                        {t.change_pct}% vs {t.before}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-2">Growth review rhythm</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {REVIEW_WORKFLOW.map((r) => (
                <div key={r.cadence} className="rounded-lg border border-border p-3">
                  <div className="text-xs font-semibold">{r.cadence}</div>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground list-disc pl-4">
                    {r.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ---------------- funnel ---------------- */}
        <TabsContent value="funnel" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Acquisition & conversion funnel</h2>
            <div className="space-y-2">
              {d.funnel.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <div className="w-44 text-sm">{s.label}</div>
                  <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary/70"
                      style={{
                        width: `${Math.min(100, d.funnel[0]?.count ? (s.count / d.funnel[0].count) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                  <div className="w-16 text-right text-sm font-medium">{s.count}</div>
                  <div className="w-40 text-right text-xs text-muted-foreground">
                    {s.conversion === null
                      ? s.sampleTooSmall
                        ? "sample too small"
                        : "—"
                      : `${s.conversion}% through · ${s.dropoff}% lost`}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Possible areas to investigate</h2>
            <div className="space-y-2">
              {d.dropoffs.map((c) => (
                <div key={`${c.from}-${c.to}`} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {c.flagged && <Badge variant="destructive">Possible area to investigate</Badge>}
                    <span className="text-sm font-medium">{c.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.from_count} → {c.to_count} ({c.conversion === null ? c.note : `${c.conversion}% carry through`}).
                    Look at: {c.investigate}. No cause is assumed.
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ---------------- journeys ---------------- */}
        <TabsContent value="journeys" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Most common paths through the site</h2>
            <DataTable columns={["Path", "Visits"]} rows={d.journeys.map((j) => [j.path, j.count])} />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Where visits end</h2>
            <DataTable columns={["Last page", "Visits"]} rows={d.exits.map((j) => [j.path, j.count])} />
          </Card>
        </TabsContent>

        {/* ---------------- pages & CTAs ---------------- */}
        <TabsContent value="pages" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Page performance</h2>
            <DataTable
              columns={["Page", "Type", "Views", "Visitors", "Engaged", "CTA clicks", "Signups", "Signup rate"]}
              rows={d.pages.map((p) => [
                p.path,
                p.page_type,
                p.views,
                p.unique_visitors,
                p.engaged_sessions,
                p.cta_clicks,
                p.signups,
                pct(p.signup_rate),
              ])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Call-to-action performance</h2>
            <DataTable
              columns={["CTA", "Page", "Placement", "Clicks", "Signups", "Conversion"]}
              rows={d.ctas.map((c) => [c.name, c.path, c.placement, c.clicks, c.signups, pct(c.conversion)])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Placement comparison</h2>
            <DataTable
              columns={["Placement", "Clicks", "Signups", "Conversion"]}
              rows={d.placements.map((p) => [p.placement, p.clicks, p.signups, pct(p.conversion)])}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Use this to decide where a CTA belongs — not as a reason to repeat the same CTA on every section.
            </p>
          </Card>
        </TabsContent>

        {/* ---------------- attribution ---------------- */}
        <TabsContent value="attribution" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Traffic sources — and which create activated customers</h2>
            <DataTable
              columns={["Source", "Visits", "Engaged", "Signups", "Signup rate", "Attributed accounts", "Activated", "Paying"]}
              rows={d.sources.map((s) => [
                s.source,
                s.sessions,
                s.engaged,
                s.signups,
                pct(s.signup_rate),
                s.attributed_accounts,
                s.activated_accounts,
                s.paying_accounts,
              ])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Content contribution</h2>
            <DataTable
              columns={["Article", "Views", "Visitors", "Product clicks", "CTA clicks", "Signups"]}
              rows={d.content.map((c) => [c.slug, c.views, c.unique_visitors, c.product_clicks, c.cta_clicks, c.signups])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Template acquisition</h2>
            <DataTable
              columns={["Template", "Type", "Views", "Previews", "Imports", "Workspaces", "Activated", "View → import"]}
              rows={d.templates.map((t) => [
                t.slug,
                t.type,
                t.views,
                t.previews,
                t.imports,
                t.importing_workspaces,
                t.activated_workspaces,
                pct(t.view_to_import),
              ])}
            />
          </Card>
        </TabsContent>

        {/* ---------------- activation ---------------- */}
        <TabsContent value="activation" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="New workspaces" value={d.activation.new_users} />
            <Stat label="Activated" value={d.activation.activated_users} hint={pct(d.activation.activation_rate)} />
            <Stat
              label="Median time to activation"
              value={d.activation.median_hours_to_activation === null ? "—" : `${d.activation.median_hours_to_activation}h`}
            />
            <Stat
              label="Fastest activation"
              value={d.activation.fastest_hours === null ? "—" : `${d.activation.fastest_hours}h`}
            />
          </div>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Which milestone activated them first</h2>
            <DataTable
              columns={["Milestone", "Workspaces"]}
              rows={d.activation.by_event.map((e) => [e.label, e.count])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Onboarding</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <DataTable
                  columns={["Step", "Started", "Completed"]}
                  rows={d.onboarding.steps.map((s) => [s.step, s.started, s.completed])}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Goal chosen at setup</div>
                <DataTable columns={["Goal", "Workspaces"]} rows={d.onboarding.goals.map((g) => [g.goal, g.count])} />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ---------------- product ---------------- */}
        <TabsContent value="product" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Feature adoption</h2>
            <DataTable
              columns={["Product area", "Created something", "Launched something", "Repeat use"]}
              rows={d.adoption.map((a) => [a.label, a.created, a.launched, a.repeat_users])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Customer segments</h2>
            <DataTable columns={["Segment", "Workspaces"]} rows={d.segments.map((s) => [s.label, s.count])} />
            <p className="mt-2 text-xs text-muted-foreground">Aggregate only — no individual customer details here.</p>
          </Card>
        </TabsContent>

        {/* ---------------- retention ---------------- */}
        <TabsContent value="retention" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Retention</h2>
            <DataTable
              columns={["Day", "Eligible", "Returned & did something", "Rate"]}
              rows={d.retention.map((r) => [`Day ${r.day}`, r.eligible, r.retained, pct(r.rate)])}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Signup cohorts</h2>
            <DataTable
              columns={["Month", "Signups", "Activated", "Used 2+ areas", "Still active", "Paying"]}
              rows={d.cohorts.map((c) => [c.month, c.signups, c.activated, c.adopted_two_areas, c.still_active, c.paying])}
            />
          </Card>
        </TabsContent>

        {/* ---------------- experiments ---------------- */}
        <TabsContent value="experiments" className="space-y-4 pt-4">
          <ExperimentsSection experiments={d.experiments as any[]} onChanged={() => qc.invalidateQueries({ queryKey: ["growth-overview"] })} />
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-2">Experiment safety rules</h2>
            <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
              {EXPERIMENT_SAFETY.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        {/* ---------------- insights & AI ---------------- */}
        <TabsContent value="insights" className="space-y-4 pt-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Growth insights</h2>
            {d.insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing stands out in this period.</p>
            ) : (
              <ul className="space-y-2">
                {d.insights.map((i, idx) => (
                  <li key={idx} className="rounded-lg border border-border p-3 text-sm">
                    <Badge variant={i.kind === "opportunity" ? "default" : "outline"} className="mr-2">
                      {i.kind === "opportunity" ? "Potential opportunity" : i.kind === "watch" ? "Watch" : "Data"}
                    </Badge>
                    {i.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <AnalystSection days={days} />
        </TabsContent>

        {/* ---------------- settings ---------------- */}
        <TabsContent value="settings" className="space-y-4 pt-4">
          <ConfigSection config={d.config} onChanged={() => qc.invalidateQueries({ queryKey: ["growth-overview"] })} />
          <AlertsSection alerts={d.alerts as any[]} onChanged={() => qc.invalidateQueries({ queryKey: ["growth-overview"] })} />
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-2">Privacy commitments</h2>
            <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
              {PRIVACY_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- activation configuration ---------------- */

function ConfigSection({
  config,
  onChanged,
}: {
  config: { activation_events: string[]; north_star_events: string[]; min_sample: number; notes: string | null };
  onChanged: () => void;
}) {
  const [activation, setActivation] = useState<string[]>(config.activation_events);
  const [northStar, setNorthStar] = useState<string[]>(config.north_star_events);
  const [minSample, setMinSample] = useState(String(config.min_sample));
  const [notes, setNotes] = useState(config.notes ?? "");
  const saveFn = useServerFn(growthSaveConfig);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          activation_events: activation,
          north_star_events: northStar,
          min_sample: Number(minSample) || 50,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Activation definition saved");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">What counts as activation</h2>
        <p className="text-xs text-muted-foreground">
          Activation is a real outcome, not a created account. Pick the milestones that mean a workspace felt the value.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIVATION_EVENTS.map((e) => (
          <label key={e.key} className="flex items-start gap-2 rounded-lg border border-border p-2">
            <Switch checked={activation.includes(e.key)} onCheckedChange={() => toggle(activation, setActivation, e.key)} />
            <span>
              <span className="text-sm">{e.label}</span>
              <span className="block text-[11px] text-muted-foreground">{e.product}</span>
            </span>
          </label>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-semibold">North star: monthly active value-creating workspaces</h3>
        <p className="text-xs text-muted-foreground mb-2">Which activity proves a workspace created value this month.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIVATION_EVENTS.map((e) => (
            <label key={e.key} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <Switch checked={northStar.includes(e.key)} onCheckedChange={() => toggle(northStar, setNorthStar, e.key)} />
              <span className="text-sm">{e.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="min-sample">Hide percentages below this many people</Label>
          <Input id="min-sample" value={minSample} onChange={(e) => setMinSample(e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="cfg-notes">Notes</Label>
          <Textarea id="cfg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save definition
      </Button>
    </Card>
  );
}

/* ---------------- experiments ---------------- */

type Experiment = {
  id?: string;
  name: string;
  hypothesis?: string | null;
  area: "messaging" | "layout" | "cta" | "content" | "onboarding";
  variant_a?: string | null;
  variant_b?: string | null;
  target_page?: string | null;
  primary_metric?: string | null;
  status: "draft" | "running" | "paused" | "completed";
  start_date?: string | null;
  end_date?: string | null;
  min_sample?: number;
  result_summary?: string | null;
  notes?: string | null;
};

const EMPTY_EXPERIMENT: Experiment = {
  name: "",
  area: "messaging",
  status: "draft",
  min_sample: 200,
};

function ExperimentsSection({ experiments, onChanged }: { experiments: any[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Experiment>(EMPTY_EXPERIMENT);
  const saveFn = useServerFn(growthSaveExperiment);
  const deleteFn = useServerFn(growthDeleteExperiment);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...draft,
          min_sample: Number(draft.min_sample) || 200,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Experiment saved");
      setOpen(false);
      setDraft(EMPTY_EXPERIMENT);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Experiment removed");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Conversion experiments</h2>
          <p className="text-xs text-muted-foreground">
            A winner is never declared automatically — each experiment records the sample it needs first.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setDraft(EMPTY_EXPERIMENT)}>
              New experiment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{draft.id ? "Edit experiment" : "New experiment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label>Hypothesis</Label>
                <Textarea
                  rows={2}
                  value={draft.hypothesis ?? ""}
                  onChange={(e) => setDraft({ ...draft, hypothesis: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Area (safe areas only)</Label>
                  <Select value={draft.area} onValueChange={(v) => setDraft({ ...draft, area: v as Experiment["area"] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["messaging", "layout", "cta", "content", "onboarding"].map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) => setDraft({ ...draft, status: v as Experiment["status"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["draft", "running", "paused", "completed"].map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Variant A</Label>
                  <Textarea rows={2} value={draft.variant_a ?? ""} onChange={(e) => setDraft({ ...draft, variant_a: e.target.value })} />
                </div>
                <div>
                  <Label>Variant B</Label>
                  <Textarea rows={2} value={draft.variant_b ?? ""} onChange={(e) => setDraft({ ...draft, variant_b: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Target page</Label>
                  <Input value={draft.target_page ?? ""} onChange={(e) => setDraft({ ...draft, target_page: e.target.value })} />
                </div>
                <div>
                  <Label>Primary metric</Label>
                  <Input
                    value={draft.primary_metric ?? ""}
                    onChange={(e) => setDraft({ ...draft, primary_metric: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Start date</Label>
                  <Input type="date" value={draft.start_date ?? ""} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input type="date" value={draft.end_date ?? ""} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                </div>
                <div>
                  <Label>Sample needed</Label>
                  <Input
                    inputMode="numeric"
                    value={String(draft.min_sample ?? 200)}
                    onChange={(e) => setDraft({ ...draft, min_sample: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label>Result (only once the sample is reached)</Label>
                <Textarea
                  rows={2}
                  value={draft.result_summary ?? ""}
                  onChange={(e) => setDraft({ ...draft, result_summary: e.target.value })}
                />
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending || draft.name.trim().length < 2}>
                {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {experiments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No experiments yet.</p>
      ) : (
        <div className="space-y-2">
          {experiments.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{e.name}</span>
                <Badge variant="outline">{e.status}</Badge>
                <Badge variant="secondary">{e.area}</Badge>
                {e.target_page && <span className="text-xs text-muted-foreground">{e.target_page}</span>}
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft(e as Experiment);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              {e.hypothesis && <p className="mt-1 text-xs text-muted-foreground">{e.hypothesis}</p>}
              {e.primary_metric && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Primary metric: {e.primary_metric} · needs {e.min_sample} people before judging
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- alerts ---------------- */

function AlertsSection({ alerts, onChanged }: { alerts: any[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<"Visitors" | "Signups" | "Activations">("Signups");
  const [direction, setDirection] = useState<"drop" | "rise">("drop");
  const [threshold, setThreshold] = useState("30");
  const saveFn = useServerFn(growthSaveAlert);
  const deleteFn = useServerFn(growthDeleteAlert);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name: name || `${metric} ${direction}`,
          metric,
          direction,
          threshold_pct: Number(threshold) || 30,
          window_days: 7,
          enabled: true,
        },
      }),
    onSuccess: () => {
      toast.success("Alert saved");
      setName("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Growth alerts</h2>
        <p className="text-xs text-muted-foreground">
          Compares this period with the one before it. Informational only — nothing is sent to customers.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <Input placeholder="Alert name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["Visitors", "Signups", "Activations"].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="drop">drops by</SelectItem>
            <SelectItem value="rise">rises by</SelectItem>
          </SelectContent>
        </Select>
        <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" placeholder="%" />
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Add alert
        </Button>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alerts configured.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.rule.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <span className="text-sm font-medium">{a.rule.name}</span>
              <span className="text-xs text-muted-foreground">
                {a.rule.metric} {a.rule.direction === "drop" ? "drops" : "rises"} {a.rule.threshold_pct}%
              </span>
              {a.fired ? <Badge variant="destructive">Triggered</Badge> : <Badge variant="outline">Quiet</Badge>}
              {a.trend?.change_pct !== null && a.trend && (
                <span className="text-xs text-muted-foreground">now {a.trend.now} ({a.trend.change_pct}%)</span>
              )}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove.mutate(a.rule.id)}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- AI analyst ---------------- */

function AnalystSection({ days }: { days: number }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const askFn = useServerFn(growthAsk);

  const ask = useMutation({
    mutationFn: (q: string) => askFn({ data: { question: q, days } }),
    onSuccess: (res) => setAnswer(res.answer),
    onError: (e: Error) => toast.error(e.message),
  });

  const examples = useMemo(
    () => [
      "Where are users dropping off?",
      "Which templates create the most activated users?",
      "Which traffic source converts best?",
      "Which onboarding step has the highest abandonment?",
    ],
    [],
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Ask the growth analyst</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        The analyst only sees the measured numbers on this page. It separates facts from possible explanations, and says
        so plainly when there isn't enough data.
      </p>
      <div className="flex flex-wrap gap-2">
        {examples.map((e) => (
          <Button key={e} size="sm" variant="outline" onClick={() => setQuestion(e)}>
            {e}
          </Button>
        ))}
      </div>
      <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question…" />
      <Button onClick={() => ask.mutate(question)} disabled={ask.isPending || question.trim().length < 4}>
        {ask.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Ask
      </Button>
      {answer && <div className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">{answer}</div>}
    </Card>
  );
}
