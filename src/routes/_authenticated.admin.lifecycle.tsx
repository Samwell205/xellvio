import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { RefreshCw, Users, Rocket, Megaphone, Gauge } from "lucide-react";
import { STAGE_LABELS, EVENT_LABELS, type LifecycleStage } from "@/lib/lifecycle/taxonomy";
import {
  getLifecycleOverview,
  listLifecycleTemplates,
  saveLifecycleTemplate,
  getTenantTimeline,
  listAnnouncements,
  createAnnouncement,
  setAnnouncementPublished,
  runLifecycleChecksNow,
} from "@/lib/admin-lifecycle.functions";

export const Route = createFileRoute("/_authenticated/admin/lifecycle")({
  head: () => ({ meta: [{ title: "Customer success — Xellvio admin" }] }),
  component: LifecyclePage,
});

const TABS = ["Overview", "Templates", "Announcements", "Workspace timeline"] as const;

function LifecyclePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Customer success</h1>
        <p className="text-sm text-muted-foreground">
          Real onboarding progress, lifecycle stages and the messages workspaces received.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {tab === "Overview" && <Overview />}
      {tab === "Templates" && <Templates />}
      {tab === "Announcements" && <Announcements />}
      {tab === "Workspace timeline" && <Timeline />}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </Card>
  );
}

function Overview() {
  const load = useServerFn(getLifecycleOverview);
  const runNow = useServerFn(runLifecycleChecksNow);
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["admin-lifecycle"], queryFn: () => load() });
  const run = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r: any) => {
      toast.success(
        `Checked ${r.checked} workspaces — ${r.reminders} reminders, ${r.reengagement} re-engagement, ${r.celebrations} celebrations`,
      );
      qc.invalidateQueries({ queryKey: ["admin-lifecycle"] });
    },
    onError: () => toast.error("Couldn't run the checks"),
  });

  const d = data.data;
  if (!d) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  const activationRate = d.totals.workspaces
    ? Math.round((d.totals.activated / d.totals.workspaces) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Workspaces tracked" value={d.totals.workspaces} />
        <Stat icon={Rocket} label="Sent a first campaign" value={d.totals.activated} />
        <Stat icon={Gauge} label="Activation rate" value={`${activationRate}%`} />
        <Stat icon={Gauge} label="Average progress" value={`${d.totals.avg_progress}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="font-semibold">Lifecycle stages</div>
          <div className="mt-3 space-y-2">
            {d.stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0">
                  {STAGE_LABELS[s.stage as LifecycleStage] ?? s.stage}
                </span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${d.totals.workspaces ? (s.count / d.totals.workspaces) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="font-semibold">Onboarding funnel</div>
          <div className="mt-3 space-y-2">
            {d.steps.map((s) => (
              <div key={s.key} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {s.completed}/{d.totals.workspaces}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Lifecycle messages</div>
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
            <RefreshCw className={`size-4 mr-1.5 ${run.isPending ? "animate-spin" : ""}`} />
            Run checks now
          </Button>
        </div>
        {d.messages.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No lifecycle messages sent yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5">Message</th>
                  <th className="py-1.5">Sent</th>
                  <th className="py-1.5">Seen</th>
                  <th className="py-1.5">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {d.messages.map((m) => (
                  <tr key={m.template_key} className="border-t">
                    <td className="py-1.5">{m.template_key}</td>
                    <td className="py-1.5 tabular-nums">{m.sent}</td>
                    <td className="py-1.5 tabular-nums">{m.seen}</td>
                    <td className="py-1.5 tabular-nums">{m.clicked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="font-semibold">Needs attention</div>
        {d.at_risk.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No workspaces are currently at risk or inactive.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {d.at_risk.map((r) => (
              <li key={r.account_id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.label ?? r.account_id.slice(0, 8)}</span>
                <Badge variant="outline">{STAGE_LABELS[r.stage as LifecycleStage] ?? r.stage}</Badge>
                <span className="text-muted-foreground">{r.progress_pct}% onboarded</span>
                <span className="text-muted-foreground">
                  last active{" "}
                  {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString() : "never"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Templates() {
  const load = useServerFn(listLifecycleTemplates);
  const save = useServerFn(saveLifecycleTemplate);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-lifecycle-templates"], queryFn: () => load() });
  const [draft, setDraft] = useState<Record<string, any>>({});

  const mutation = useMutation({
    mutationFn: (data: any) => save({ data }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["admin-lifecycle-templates"] });
    },
    onError: () => toast.error("Couldn't save the template"),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every lifecycle message is editable here. Messages are only sent when the matching goal is
        still open, and workspaces that opted out are always skipped.
      </p>
      {(list.data ?? []).map((t: any) => {
        const d = { ...t, ...(draft[t.key] ?? {}) };
        return (
          <Card key={t.key} className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t.key}</span>
                <Badge variant="secondary">{t.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  {(t.channels ?? []).join(", ")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Enabled</span>
                <Switch
                  checked={d.enabled}
                  onCheckedChange={(v) => mutation.mutate({ key: t.key, enabled: v })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={d.title ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [t.key]: { ...d, title: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Email subject</Label>
                <Input
                  value={d.subject ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [t.key]: { ...d, subject: e.target.value } })
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Body</Label>
              <Textarea
                rows={3}
                value={d.body ?? ""}
                onChange={(e) => setDraft({ ...draft, [t.key]: { ...d, body: e.target.value } })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Button label</Label>
                <Input
                  value={d.cta_label ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [t.key]: { ...d, cta_label: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Button link</Label>
                <Input
                  value={d.cta_path ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [t.key]: { ...d, cta_path: e.target.value } })
                  }
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  key: t.key,
                  title: d.title,
                  subject: d.subject || null,
                  body: d.body,
                  cta_label: d.cta_label || null,
                  cta_path: d.cta_path || null,
                })
              }
            >
              Save changes
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

function Announcements() {
  const load = useServerFn(listAnnouncements);
  const create = useServerFn(createAnnouncement);
  const setPublished = useServerFn(setAnnouncementPublished);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-announcements"], queryFn: () => load() });
  const [form, setForm] = useState({ title: "", body: "", cta_label: "", cta_path: "" });

  const add = useMutation({
    mutationFn: (publish: boolean) =>
      create({
        data: {
          title: form.title,
          body: form.body,
          kind: "feature" as const,
          cta_label: form.cta_label || null,
          cta_path: form.cta_path || null,
          publish,
        },
      }),
    onSuccess: () => {
      toast.success("Announcement saved");
      setForm({ title: "", body: "", cta_label: "", cta_path: "" });
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: () => toast.error("Couldn't save the announcement"),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; published: boolean }) => setPublished({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-2">
          <Megaphone className="size-4" /> New announcement
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Body</Label>
          <Textarea
            rows={3}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Button label</Label>
            <Input
              value={form.cta_label}
              onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Button link</Label>
            <Input
              value={form.cta_path}
              onChange={(e) => setForm({ ...form, cta_path: e.target.value })}
              placeholder="/app/campaigns"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!form.title || !form.body || add.isPending}
            onClick={() => add.mutate(false)}
          >
            Save as draft
          </Button>
          <Button
            size="sm"
            disabled={!form.title || !form.body || add.isPending}
            onClick={() => add.mutate(true)}
          >
            Publish now
          </Button>
        </div>
      </Card>

      {(list.data ?? []).map((a: any) => (
        <Card key={a.id} className="p-4 flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{a.title}</div>
            <p className="text-sm text-muted-foreground">{a.body}</p>
          </div>
          <Badge variant={a.published_at ? "default" : "outline"}>
            {a.published_at ? "Published" : "Draft"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggle.mutate({ id: a.id, published: !a.published_at })}
          >
            {a.published_at ? "Unpublish" : "Publish"}
          </Button>
        </Card>
      ))}
    </div>
  );
}

function Timeline() {
  const load = useServerFn(getTenantTimeline);
  const [id, setId] = useState("");
  const [accountId, setAccountId] = useState("");
  const data = useQuery({
    queryKey: ["admin-tenant-timeline", accountId],
    queryFn: () => load({ data: { accountId } }),
    enabled: Boolean(accountId),
  });

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <Label className="text-xs">Workspace ID</Label>
        <div className="flex gap-2">
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="account id" />
          <Button size="sm" onClick={() => setAccountId(id.trim())}>
            Load
          </Button>
        </div>
      </Card>
      {data.data && (
        <>
          <Card className="p-5">
            <div className="font-semibold">Lifecycle</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Stage {(data.data as any).lifecycle?.stage ?? "unknown"} ·{" "}
              {(data.data as any).lifecycle?.progress_pct ?? 0}% onboarded
            </div>
          </Card>
          <Card className="p-5">
            <div className="font-semibold">Activity</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {(data.data as any).events.map((e: any, i: number) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-40 shrink-0">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  <span>{(EVENT_LABELS as any)[e.event] ?? e.event}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <div className="font-semibold">Messages received</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {(data.data as any).messages.map((m: any, i: number) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-40 shrink-0">
                    {new Date(m.sent_at).toLocaleString()}
                  </span>
                  <span>{m.template_key}</span>
                  <Badge variant="outline">{m.channel}</Badge>
                  {m.clicked_at && <Badge>clicked</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
