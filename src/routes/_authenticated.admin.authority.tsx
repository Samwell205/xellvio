import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Link2, Globe, Users, FileBarChart, Megaphone, Share2, MessagesSquare,
  ListChecks, Info, ExternalLink, Send, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RecordForm } from "@/components/authority/RecordForm";
import {
  ASSET_FIELDS, BRAND_FIELDS, DIRECTORY_FIELDS, DISTRIBUTION_FIELDS, MENTION_FIELDS,
  OPPORTUNITY_FIELDS, PARTNER_FIELDS, REFERRAL_FIELDS, type Field,
} from "@/lib/authority/fields";
import {
  FLYWHEEL, GEO_ENTITY_SIGNALS, MONTHLY_WORKFLOW, OPPORTUNITY_TYPE_LABEL, OUTREACH_STANDARDS,
  QUALITY_CHECKS, QUALITY_LABEL, SAFETY_RULES, STAGES, STAGE_LABEL, priorityScore, suggestQuality,
  type OpportunityType, type QualityAnswers,
} from "@/lib/authority/taxonomy";
import {
  authorityDelete, authorityGetBrandProfile, authorityKpis, authorityList,
  authorityLogOutreach, authorityOutreachHistory, authoritySave, authoritySaveBrandProfile,
  type AuthorityTable,
} from "@/lib/authority.functions";

export const Route = createFileRoute("/_authenticated/admin/authority")({
  component: AuthorityDashboard,
});

function useRecords(table: AuthorityTable) {
  return useQuery({
    queryKey: ["authority", table],
    queryFn: () => authorityList({ data: { table } }),
    staleTime: 15_000,
  });
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

/** Generic list + create/edit/delete surface for one authority table. */
function RecordSection({
  table,
  title,
  description,
  fields,
  columns,
  filter,
  defaults,
  icon: Icon,
  extraFor,
  rowActions,
}: {
  table: AuthorityTable;
  title: string;
  description: string;
  fields: Field[];
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  filter?: (row: any) => boolean;
  defaults?: Record<string, any>;
  icon: any;
  extraFor?: (values: any) => React.ReactNode;
  rowActions?: (row: any) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useRecords(table);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: (values: Record<string, any>) =>
      authoritySave({ data: { table, id: editing?.id, values } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authority", table] });
      qc.invalidateQueries({ queryKey: ["authority-kpis"] });
      setOpen(false);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => authorityDelete({ data: { table, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authority", table] });
      qc.invalidateQueries({ queryKey: ["authority-kpis"] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not remove"),
  });

  const rows = (data ?? []).filter((r: any) => (filter ? filter(r) : true));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-primary" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(defaults ? ({ ...defaults } as any) : null);
            setOpen(true);
          }}
        >
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. Everything here is added by a person after real research.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow key={row.id}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="align-top max-w-[280px]">
                        {c.render ? c.render(row) : (row[c.key] ?? "—")}
                      </TableCell>
                    ))}
                    <TableCell className="text-right whitespace-nowrap">
                      {rowActions?.(row)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(row.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <RecordForm
        open={open}
        onOpenChange={setOpen}
        title={editing?.id ? `Edit — ${title}` : `Add — ${title}`}
        description={description}
        fields={fields}
        initial={editing}
        onSubmit={(values) => save.mutate({ ...(defaults ?? {}), ...values })}
        saving={save.isPending}
        extra={extraFor?.(editing)}
      />
    </Card>
  );
}

/** Six relevance checks that produce a suggested quality label + priority score. */
function QualityChecklist({ opportunityType }: { opportunityType?: OpportunityType }) {
  const [answers, setAnswers] = useState<QualityAnswers>({});
  const quality = suggestQuality(answers);
  const score = priorityScore({
    quality,
    answers,
    opportunityType: opportunityType ?? "resource_mention",
    hasTargetPage: true,
  });
  return (
    <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ListChecks className="size-4 text-primary" /> Relevance & quality check
      </div>
      <p className="text-xs text-muted-foreground">
        Answer these before pursuing anything. Relevance decides priority — never backlink counts.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {QUALITY_CHECKS.map((c) => (
          <label key={c.key} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
            <span>
              <span className="text-sm">{c.label}</span>
              <span className="block text-[11px] text-muted-foreground">{c.help}</span>
            </span>
            <Switch
              checked={answers[c.key] === true}
              onCheckedChange={(v) => setAnswers((p) => ({ ...p, [c.key]: v }))}
            />
          </label>
        ))}
      </div>
      <p className="text-xs">
        Suggested label: <Badge variant="outline">{QUALITY_LABEL[quality]}</Badge>{" "}
        suggested priority score: <strong>{score}</strong> — copy these into the fields below if you agree.
      </p>
    </div>
  );
}

/** Outreach history + a single logging form. Nothing is ever sent from here. */
function OutreachPanel({ opportunity, onClose }: { opportunity: any; onClose: () => void }) {
  const qc = useQueryClient();
  const history = useQuery({
    queryKey: ["authority-outreach", opportunity.id],
    queryFn: () => authorityOutreachHistory({ data: { opportunity_id: opportunity.id } }),
  });
  const [direction, setDirection] = useState("sent");
  const [channel, setChannel] = useState("email");
  const [stage, setStage] = useState<string>(opportunity.stage ?? "contacted");
  const [summary, setSummary] = useState("");

  const log = useMutation({
    mutationFn: () =>
      authorityLogOutreach({
        data: { opportunity_id: opportunity.id, direction: direction as any, channel, summary, stage },
      }),
    onSuccess: () => {
      setSummary("");
      history.refetch();
      qc.invalidateQueries({ queryKey: ["authority", "authority_opportunities"] });
      qc.invalidateQueries({ queryKey: ["authority-kpis"] });
      toast.success("Logged");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not log"),
  });

  const sentCount = (history.data ?? []).filter((h: any) => h.direction === "sent").length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Outreach — {opportunity.website_name}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border p-3 text-xs space-y-2 bg-muted/30">
          <div className="font-medium flex items-center gap-2">
            <Info className="size-3.5" /> Outreach standards
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ul className="space-y-1">
              {OUTREACH_STANDARDS.do.map((d) => (
                <li key={d}>✅ {d}</li>
              ))}
            </ul>
            <ul className="space-y-1">
              {OUTREACH_STANDARDS.dont.map((d) => (
                <li key={d}>🚫 {d}</li>
              ))}
            </ul>
          </div>
          {sentCount >= 2 ? (
            <p className="text-destructive font-medium">
              Two messages already sent. Stop here — do not follow up again.
            </p>
          ) : null}
        </div>

        {opportunity.pitch_draft ? (
          <div className="space-y-1">
            <Label className="text-xs">Pitch draft (send this yourself, from your own mailbox)</Label>
            <Textarea readOnly rows={6} value={opportunity.pitch_draft} />
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sent">Message sent</SelectItem>
                <SelectItem value="received">Reply received</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["email", "contact_form", "linkedin", "x", "community", "call"].map((c) => (
                  <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Move to stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">What happened</Label>
          <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">History</Label>
          {(history.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No contact recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {(history.data ?? []).map((h: any) => (
                <li key={h.id} className="rounded-md border border-border p-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.occurred_at).toLocaleString()} · {h.direction} · {h.channel ?? "—"}
                  </div>
                  <div>{h.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={!summary.trim() || log.isPending} onClick={() => log.mutate()}>
            <Send className="size-4 mr-1" /> Log interaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BrandProfileSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["authority-brand"], queryFn: () => authorityGetBrandProfile() });
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (values: Record<string, any>) =>
      authoritySaveBrandProfile({ data: { id: (data as any).id, values } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authority-brand"] });
      setOpen(false);
      toast.success("Brand profile saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const row: any = data;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" /> Brand profile
            </CardTitle>
            <CardDescription>
              The wording used for every directory, listing and press mention, so Xellvio is described
              identically everywhere.
            </CardDescription>
          </div>
          <Button size="sm" disabled={!row} onClick={() => setOpen(true)}>
            <Pencil className="size-4 mr-1" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!row ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div><span className="text-muted-foreground">Name:</span> {row.brand_name}</div>
              <div><span className="text-muted-foreground">Website:</span> {row.website_url ?? "—"}</div>
              <div><span className="text-muted-foreground">Tagline:</span> {row.tagline ?? "—"}</div>
              <div><span className="text-muted-foreground">Short description:</span> {row.short_description ?? "—"}</div>
              <div><span className="text-muted-foreground">Categories:</span> {(row.primary_categories ?? []).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">Key features:</span> {(row.key_features ?? []).join(", ") || "—"}</div>
              <div><span className="text-muted-foreground">Official profiles:</span> {(row.social_profiles ?? []).join(", ") || "—"}</div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entity consistency checklist</CardTitle>
          <CardDescription>What helps search engines and AI systems recognise Xellvio.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2 list-disc pl-5">
            {GEO_ENTITY_SIGNALS.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </CardContent>
      </Card>

      <RecordForm
        open={open}
        onOpenChange={setOpen}
        title="Brand profile"
        description="Reuse this wording verbatim on every external listing."
        fields={BRAND_FIELDS}
        initial={row}
        onSubmit={(values) => save.mutate(values)}
        saving={save.isPending}
      />
    </div>
  );
}

function AuthorityDashboard() {
  const kpis = useQuery({ queryKey: ["authority-kpis"], queryFn: () => authorityKpis(), staleTime: 15_000 });
  const opportunities = useRecords("authority_opportunities");
  const [outreachFor, setOutreachFor] = useState<any | null>(null);
  const k = kpis.data;

  const pipeline = useMemo(() => {
    const rows = opportunities.data ?? [];
    return STAGES.map((s) => ({ stage: s, rows: rows.filter((r: any) => r.stage === s) }));
  }, [opportunities.data]);

  const oppColumns = [
    {
      key: "website_name",
      label: "Website",
      render: (r: any) => (
        <div>
          <div className="font-medium">{r.website_name}</div>
          {r.website_url ? (
            <a href={r.website_url} target="_blank" rel="noreferrer nofollow" className="text-xs text-primary inline-flex items-center gap-1">
              visit <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      ),
    },
    { key: "opportunity_type", label: "Type", render: (r: any) => OPPORTUNITY_TYPE_LABEL[r.opportunity_type as OpportunityType] ?? r.opportunity_type },
    { key: "quality", label: "Quality", render: (r: any) => <Badge variant="outline">{QUALITY_LABEL[r.quality as keyof typeof QUALITY_LABEL] ?? r.quality}</Badge> },
    { key: "priority_score", label: "Priority" },
    { key: "stage", label: "Stage", render: (r: any) => STAGE_LABEL[r.stage as keyof typeof STAGE_LABEL] ?? r.stage },
    { key: "target_page", label: "Target page" },
  ];

  const outreachAction = (row: any) => (
    <Button variant="ghost" size="icon" onClick={() => setOutreachFor(row)} title="Outreach">
      <Send className="size-4" />
    </Button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Authority & distribution</h1>
        <p className="text-sm text-muted-foreground">
          A place to plan real backlinks, brand mentions, listings, partnerships and content
          distribution. Nothing here contacts anyone automatically — people send their own messages.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="mentions">Brand mentions</TabsTrigger>
          <TabsTrigger value="directories">Directories</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="assets">Assets & research</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="referrals">Referral results</TabsTrigger>
          <TabsTrigger value="brand">Brand profile</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Opportunities" value={k?.opportunities ?? 0} hint={`${k?.byQuality?.high_value ?? 0} high value`} />
            <Stat label="Links / mentions earned" value={k?.linksEarned ?? 0} />
            <Stat label="Contacted this month" value={k?.contactedThisMonth ?? 0} hint="Personalised, one at a time" />
            <Stat label="Brand mentions" value={k?.mentions.total ?? 0} hint={`${k?.mentions.unlinked ?? 0} unlinked`} />
            <Stat label="Live listings" value={`${k?.directories.live ?? 0}/${k?.directories.total ?? 0}`} />
            <Stat label="Published partners" value={`${k?.partners.published ?? 0}/${k?.partners.total ?? 0}`} />
            <Stat label="Linkable assets" value={`${k?.assets.published ?? 0}/${k?.assets.total ?? 0}`} hint={`${k?.assets.research ?? 0} original research`} />
            <Stat label="Referral visitors" value={k?.referrals.visitors ?? 0} hint={`${k?.referrals.signups ?? 0} signups`} />
          </div>

          {k?.needsFollowUp?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Waiting on a reply for over a week</CardTitle>
                <CardDescription>One polite follow-up maximum, then move on.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {k.needsFollowUp.map((o) => (
                    <li key={o.id}>
                      {o.website_name} — last contacted {o.last_contact_at ? new Date(o.last_contact_at).toLocaleDateString() : "—"}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly rhythm</CardTitle>
                <CardDescription>Repeat this loop every month.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {MONTHLY_WORKFLOW.map((w) => (
                  <div key={w.week} className="rounded-lg border border-border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{w.week}</div>
                    <div className="font-medium text-sm">{w.title}</div>
                    <ul className="text-xs text-muted-foreground mt-1 list-disc pl-4 space-y-0.5">
                      {w.items.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">How authority compounds</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {FLYWHEEL.map((f) => (
                  <Badge key={f} variant="secondary" className="font-normal">{f}</Badge>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Always</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1.5 list-disc pl-5">
                  {SAFETY_RULES.always.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </CardContent>
            </Card>
            <Card className="border-destructive/40">
              <CardHeader><CardTitle className="text-base text-destructive">Never</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1.5 list-disc pl-5">
                  {SAFETY_RULES.never.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="opportunities" className="mt-4">
          <RecordSection
            table="authority_opportunities"
            title="Backlink, guest, PR & community opportunities"
            description="Every place worth earning a mention from — qualified on relevance, not metrics."
            fields={OPPORTUNITY_FIELDS}
            columns={oppColumns}
            icon={Link2}
            extraFor={(values) => <QualityChecklist opportunityType={values?.opportunity_type} />}
            rowActions={outreachAction}
          />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outreach pipeline</CardTitle>
              <CardDescription>
                Identified → researched → qualified → pitch ready → contacted → follow-up → response → earned.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pipeline.map((col) => (
                <div key={col.stage} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{STAGE_LABEL[col.stage]}</span>
                    <Badge variant="secondary">{col.rows.length}</Badge>
                  </div>
                  {col.rows.slice(0, 8).map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => setOutreachFor(r)}
                      className="w-full text-left text-xs rounded-md border border-border px-2 py-1.5 hover:bg-accent"
                    >
                      {r.website_name}
                      <span className="block text-muted-foreground">
                        {OPPORTUNITY_TYPE_LABEL[r.opportunity_type as OpportunityType] ?? r.opportunity_type}
                      </span>
                    </button>
                  ))}
                  {col.rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Empty</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mentions" className="mt-4">
          <RecordSection
            table="authority_mentions"
            title="Brand mentions"
            description="Places Xellvio is talked about. Unlinked mentions are the easiest links to earn."
            fields={MENTION_FIELDS}
            icon={MessagesSquare}
            columns={[
              { key: "source_name", label: "Source" },
              { key: "term", label: "Term" },
              { key: "link_state", label: "Linked" },
              { key: "sentiment", label: "Sentiment" },
              { key: "review_status", label: "Review" },
              { key: "suggested_target_page", label: "Suggested link" },
            ]}
          />
        </TabsContent>

        <TabsContent value="directories" className="mt-4">
          <RecordSection
            table="authority_directories"
            title="Product & SaaS directories"
            description="Relevant, genuine listings only — no bulk or paid link directories."
            fields={DIRECTORY_FIELDS}
            icon={Globe}
            columns={[
              { key: "platform", label: "Platform" },
              { key: "status", label: "Status" },
              { key: "category", label: "Category" },
              { key: "quality", label: "Quality" },
              { key: "last_updated_at", label: "Reviewed" },
            ]}
          />
        </TabsContent>

        <TabsContent value="partners" className="mt-4 space-y-3">
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Partner pages go live at <code>/partners</code> only when a partnership is marked verified
              and published — so the public site never claims a relationship that does not exist.
            </CardContent>
          </Card>
          <RecordSection
            table="authority_partners"
            title="Partners & integrations"
            description="Real integrations and partnerships, each with its own public profile page."
            fields={PARTNER_FIELDS}
            icon={Users}
            columns={[
              { key: "name", label: "Partner" },
              { key: "relationship", label: "Relationship" },
              { key: "verified", label: "Verified", render: (r: any) => (r.verified ? "Yes" : "No") },
              {
                key: "published",
                label: "Public",
                render: (r: any) =>
                  r.published ? (
                    <a className="text-primary" href={`/partners/${r.slug}`} target="_blank" rel="noreferrer">
                      /partners/{r.slug}
                    </a>
                  ) : (
                    "Private"
                  ),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <RecordSection
            table="authority_assets"
            title="Linkable assets & original research"
            description="Guides, tools, calculators and research people cite because they are useful."
            fields={ASSET_FIELDS}
            icon={FileBarChart}
            columns={[
              { key: "name", label: "Asset" },
              { key: "asset_type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "is_research", label: "Research", render: (r: any) => (r.is_research ? "Yes" : "—") },
              { key: "page_path", label: "Page" },
            ]}
          />
        </TabsContent>

        <TabsContent value="distribution" className="mt-4">
          <RecordSection
            table="authority_distribution"
            title="Distribution & repurposing"
            description="Adapt one strong piece per channel and audience — never the same text everywhere."
            fields={DISTRIBUTION_FIELDS}
            icon={Share2}
            columns={[
              { key: "content_piece", label: "Content" },
              { key: "channel", label: "Channel" },
              { key: "post_format", label: "Format" },
              { key: "status", label: "Status" },
              { key: "scheduled_for", label: "Scheduled" },
            ]}
          />
        </TabsContent>

        <TabsContent value="referrals" className="mt-4 space-y-4">
          {k?.topSources?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="size-4 text-primary" /> Top referral sources
                </CardTitle>
                <CardDescription>Measured figures you recorded — no estimates.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {k.topSources.map((s) => (
                    <li key={s.source_name}>
                      {s.source_name} — {s.visitors} visitors, {s.signups} signups
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <RecordSection
            table="authority_referrals"
            title="Referral performance"
            description="What each placement actually delivered: visitors, engagement and signups."
            fields={REFERRAL_FIELDS}
            icon={Megaphone}
            columns={[
              { key: "source_name", label: "Source" },
              { key: "source_type", label: "Type" },
              { key: "landing_page", label: "Landing page" },
              { key: "visitors", label: "Visitors" },
              { key: "signups", label: "Signups" },
              { key: "period_end", label: "Period end" },
            ]}
          />
        </TabsContent>

        <TabsContent value="brand" className="mt-4">
          <BrandProfileSection />
        </TabsContent>
      </Tabs>

      {outreachFor ? <OutreachPanel opportunity={outreachFor} onClose={() => setOutreachFor(null)} /> : null}
    </div>
  );
}
