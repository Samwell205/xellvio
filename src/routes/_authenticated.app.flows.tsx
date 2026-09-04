import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteFlow, listFlowRuns, listFlows, saveFlow, sendFlowTest, setFlowStatus } from "@/lib/flows.functions";
import { listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Clock, MessageSquare, Plus, Send, Trash2, Workflow, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/flows")({
  head: () => ({
    meta: [
      { title: "Flows — SMS automation — Xellvio" },
      { name: "description", content: "Automate SMS follow-ups that send themselves when someone joins a list or texts a keyword." },
      { property: "og:title", content: "Flows — SMS automation — Xellvio" },
      { property: "og:description", content: "Automate SMS follow-ups that send themselves when someone joins a list or texts a keyword." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FlowsPage,
});

type StepDraft = { delay_minutes: number; body: string };
type Draft = {
  id?: string;
  name: string;
  trigger_type: "new_contact" | "list_join" | "keyword_reply";
  trigger_keyword: string;
  trigger_list_id: string | null;
  status: "draft" | "live" | "paused";
  steps: StepDraft[];
};

const EMPTY: Draft = {
  name: "",
  trigger_type: "new_contact",
  trigger_keyword: "",
  trigger_list_id: null,
  status: "draft",
  steps: [{ delay_minutes: 0, body: "Thanks for joining! Reply STOP to opt out." }],
};

const TRIGGER_LABEL: Record<Draft["trigger_type"], string> = {
  new_contact: "New contact added",
  list_join: "Added to a list",
  keyword_reply: "Texts a keyword",
};

function FlowsPage() {
  const qc = useQueryClient();
  const listFlowsFn = useServerFn(listFlows);
  const saveFn = useServerFn(saveFlow);
  const statusFn = useServerFn(setFlowStatus);
  const deleteFn = useServerFn(deleteFlow);
  const testFn = useServerFn(sendFlowTest);
  const runsFn = useServerFn(listFlowRuns);
  const listsFn = useServerFn(listAudienceContactLists);

  const flowsQ = useQuery({ queryKey: ["flows"], queryFn: () => listFlowsFn(), refetchInterval: 30_000 });
  const runsQ = useQuery({ queryKey: ["flow-runs"], queryFn: () => runsFn(), refetchInterval: 30_000 });
  const listsQ = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const save = useMutation({
    mutationFn: async (d: Draft) =>
      saveFn({
        data: {
          id: d.id,
          name: d.name,
          trigger_type: d.trigger_type,
          trigger_keyword: d.trigger_keyword || null,
          trigger_list_id: d.trigger_list_id,
          status: d.status,
          steps: d.steps.map((s) => ({ delay_minutes: Number(s.delay_minutes) || 0, body: s.body })),
        },
      }),
    onSuccess: () => {
      toast.success("Flow saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save flow"),
  });

  const toggle = useMutation({
    mutationFn: async (v: { id: string; status: "live" | "paused" }) => statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flows"] }),
    onError: (e: any) => toast.error(e.message ?? "Could not update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Flow deleted");
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete"),
  });

  const test = useMutation({
    mutationFn: async (body: string) => testFn({ data: { body, phone: testPhone } }),
    onSuccess: () => toast.success("Test text sent"),
    onError: (e: any) => toast.error(e.message ?? "Could not send test"),
  });

  const flows = flowsQ.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Flows</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Set up texts that send themselves — a welcome message when someone joins, or an instant reply when they text
            your keyword. You are only charged for texts that actually go out.
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}><Plus className="mr-2 size-4" />Create flow</Button>
      </div>

      {flows.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-14 text-center">
          <Workflow className="size-10 text-primary" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Automate your follow-ups</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Welcome new subscribers, answer keywords like JOIN, and follow up a few hours later — all without lifting a
              finger.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setDraft({ ...EMPTY })}>Create your first flow</Button>
            <Button
              variant="outline"
              onClick={() =>
                setDraft({
                  ...EMPTY,
                  name: "Keyword auto-reply",
                  trigger_type: "keyword_reply",
                  trigger_keyword: "JOIN",
                  steps: [{ delay_minutes: 0, body: "You're in! Expect our best offers by text. Reply STOP to opt out." }],
                })
              }
            >
              Use keyword template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {flows.map((f: any) => (
            <Card key={f.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{f.name}</h3>
                    <Badge variant={f.status === "live" ? "default" : "outline"} className="capitalize">{f.status}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Zap className="size-3" />{TRIGGER_LABEL[f.trigger_type as Draft["trigger_type"]]}
                      {f.trigger_keyword ? `: ${f.trigger_keyword}` : ""}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="size-3" />{f.steps.length} message{f.steps.length === 1 ? "" : "s"}</span>
                    <span>{f.stats.sent} sent · {f.stats.scheduled} waiting · {f.stats.failed} failed</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Live</span>
                    <Switch
                      checked={f.status === "live"}
                      onCheckedChange={(v) => toggle.mutate({ id: f.id, status: v ? "live" : "paused" })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        id: f.id,
                        name: f.name,
                        trigger_type: f.trigger_type,
                        trigger_keyword: f.trigger_keyword ?? "",
                        trigger_list_id: f.trigger_list_id ?? null,
                        status: f.status,
                        steps: f.steps.map((s: any) => ({ delay_minutes: s.delay_minutes, body: s.body })),
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t pt-4">
                {f.steps.map((s: any) => (
                  <div key={s.id} className="flex items-start gap-3 text-sm">
                    <Badge variant="outline" className="mt-0.5 shrink-0">
                      <Clock className="mr-1 size-3" />
                      {s.delay_minutes === 0 ? "Immediately" : `${s.delay_minutes} min later`}
                    </Badge>
                    <p className="whitespace-pre-wrap text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {(runsQ.data?.length ?? 0) > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold">Recent automated texts</h3>
          <div className="mt-3 space-y-2 text-sm">
            {runsQ.data!.slice(0, 10).map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                <span className="font-mono text-xs">{r.phone_e164}</span>
                <span className="text-xs text-muted-foreground">Message {r.step_position}</span>
                <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "outline"} className="capitalize">
                  {r.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{new Date(r.sent_at ?? r.run_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit flow" : "Create a flow"}</DialogTitle>
            <DialogDescription>Pick what starts it, then write the texts it should send.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-5">
              <div>
                <Label>Flow name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Start this flow when…</Label>
                  <Select
                    value={draft.trigger_type}
                    onValueChange={(v) => setDraft({ ...draft, trigger_type: v as Draft["trigger_type"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_contact">A new contact is added</SelectItem>
                      <SelectItem value="list_join">Someone joins a list</SelectItem>
                      <SelectItem value="keyword_reply">Someone texts a keyword</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.trigger_type === "list_join" && (
                  <div>
                    <Label>List</Label>
                    <Select
                      value={draft.trigger_list_id ?? "any"}
                      onValueChange={(v) => setDraft({ ...draft, trigger_list_id: v === "any" ? null : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any list</SelectItem>
                        {(listsQ.data ?? []).map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {draft.trigger_type === "keyword_reply" && (
                  <div>
                    <Label>Keyword</Label>
                    <Input
                      value={draft.trigger_keyword}
                      onChange={(e) => setDraft({ ...draft, trigger_keyword: e.target.value.toUpperCase() })}
                      placeholder="JOIN"
                      maxLength={40}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Messages</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={draft.steps.length >= 10}
                    onClick={() => setDraft({ ...draft, steps: [...draft.steps, { delay_minutes: 60, body: "" }] })}
                  >
                    <Plus className="mr-1 size-3" />Add message
                  </Button>
                </div>
                {draft.steps.map((s, i) => (
                  <Card key={i} className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Message {i + 1}</Badge>
                        <Input
                          type="number"
                          min={0}
                          max={43200}
                          className="w-24"
                          value={s.delay_minutes}
                          onChange={(e) => {
                            const steps = [...draft.steps];
                            steps[i] = { ...s, delay_minutes: Number(e.target.value) };
                            setDraft({ ...draft, steps });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">minutes after the trigger</span>
                      </div>
                      {draft.steps.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, x) => x !== i) })}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      rows={3}
                      value={s.body}
                      maxLength={1200}
                      placeholder="Hi {{first_name}}, thanks for joining! Reply STOP to opt out."
                      onChange={(e) => {
                        const steps = [...draft.steps];
                        steps[i] = { ...s, body: e.target.value };
                        setDraft({ ...draft, steps });
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="max-w-[220px]"
                        placeholder="+1 555 123 4567"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!s.body.trim() || testPhone.trim().length < 8 || test.isPending}
                        onClick={() => test.mutate(s.body)}
                      >
                        <Send className="mr-1 size-3" />Send test
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Turn this flow live</div>
                  <p className="text-xs text-muted-foreground">Live flows send automatically to new triggers.</p>
                </div>
                <Switch
                  checked={draft.status === "live"}
                  onCheckedChange={(v) => setDraft({ ...draft, status: v ? "live" : "draft" })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              disabled={!draft?.name.trim() || !draft?.steps.every((s) => s.body.trim()) || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending ? "Saving…" : "Save flow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
