import { useEffect, useState } from "react";
import { Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_META,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  MERGE_TAGS,
  smsSegments,
  stepDef,
  type NodeConfig,
} from "@/lib/automation-catalog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ConfigTarget = {
  id: string;
  stepType: string;
  label: string;
  config: NodeConfig;
};

type Props = {
  target: ConfigTarget | null;
  lists: { id: string; name: string }[];
  senders: { value: string; label: string }[];
  onClose: () => void;
  onSave: (id: string, label: string, config: NodeConfig) => void;
  onSendTest: (stepType: string, config: NodeConfig) => Promise<void> | void;
};

type Condition = { field: string; operator: string; value: string };

export function ConfigPanel({ target, lists, senders, onClose, onSave, onSendTest }: Props) {
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<NodeConfig>({});
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLabel(target.label);
    setConfig({ ...target.config });
  }, [target?.id, target?.label, target?.config]);

  if (!target) return null;
  const def = stepDef(target.stepType);
  const meta = CATEGORY_META[def.category];
  const Icon = def.icon;
  const set = (key: string, value: unknown) => setConfig((c) => ({ ...c, [key]: value }));
  const str = (key: string) => String(config[key] ?? "");

  const conditions: Condition[] = Array.isArray(config["conditions"]) ? (config["conditions"] as Condition[]) : [];
  const setConditions = (next: Condition[]) => set("conditions", next);
  const filters: Condition[] = Array.isArray(config["filters"]) ? (config["filters"] as Condition[]) : [];

  const insertTag = (key: string, tag: string) => set(key, `${str(key)}${tag}`);

  const smsBody = str("body");

  return (
    <aside className="animate-in slide-in-from-right-4 duration-200 flex w-[380px] shrink-0 flex-col border-l bg-card">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg", meta.soft, meta.text)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{meta.label}</p>
          <p className="truncate text-sm font-semibold">{def.label}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Separator />

      <ScrollArea className="flex-1">
        <div className="space-y-5 px-4 py-4">
          <Field label="Step name">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={def.label} />
          </Field>

          {/* ---------- TRIGGERS ---------- */}
          {target.stepType === "trigger.contact_added" && (
            <>
              <Field label="List">
                <Select value={str("list_id") || "any"} onValueChange={(v) => set("list_id", v === "any" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Any list" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any list</SelectItem>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <ConditionList
                title="Filters"
                rows={filters}
                onChange={(rows) => set("filters", rows)}
                match={String(config["filter_match"] ?? "all")}
                onMatchChange={(m) => set("filter_match", m)}
              />
            </>
          )}

          {(target.stepType === "trigger.tag_added" || target.stepType === "trigger.tag_removed") && (
            <Field label="Tag">
              <Input value={str("tag")} onChange={(e) => set("tag", e.target.value)} placeholder="e.g. Lead" />
            </Field>
          )}

          {target.stepType === "trigger.custom_event" && (
            <Field label="Event name">
              <Input value={str("event_name")} onChange={(e) => set("event_name", e.target.value)} placeholder="e.g. cart_abandoned" />
            </Field>
          )}

          {target.stepType === "trigger.datetime" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" value={str("run_at")} onChange={(e) => set("run_at", e.target.value)} /></Field>
              <Field label="Time"><Input type="time" value={str("run_time") || "09:00"} onChange={(e) => set("run_time", e.target.value)} /></Field>
            </div>
          )}

          {/* ---------- SEND EMAIL ---------- */}
          {target.stepType === "action.send_email" && (
            <>
              <Field label="Subject">
                <Input value={str("subject")} onChange={(e) => set("subject", e.target.value)} placeholder="Welcome to the family" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From name"><Input value={str("from_name")} onChange={(e) => set("from_name", e.target.value)} /></Field>
                <Field label="From email"><Input value={str("from_email")} onChange={(e) => set("from_email", e.target.value)} placeholder="hello@yourbrand.com" /></Field>
              </div>
              <Field label="Reply-to"><Input value={str("reply_to")} onChange={(e) => set("reply_to", e.target.value)} /></Field>
              <Field label="Message">
                <Textarea rows={7} value={str("html")} onChange={(e) => set("html", e.target.value)} placeholder="Hi {{contact.first_name}}, ..." />
              </Field>
              <TagRow onInsert={(t) => insertTag("html", t)} />
              <div className="space-y-3 rounded-lg border p-3">
                <ToggleRow label="Track opens" checked={config["track_opens"] !== false} onChange={(v) => set("track_opens", v)} />
                <ToggleRow label="Track clicks" checked={config["track_clicks"] !== false} onChange={(v) => set("track_clicks", v)} />
              </div>
              <PreviewBox title={str("subject") || "No subject yet"} body={str("html")} />
            </>
          )}

          {/* ---------- SEND SMS / WHATSAPP ---------- */}
          {(target.stepType === "action.send_sms" || target.stepType === "action.send_whatsapp") && (
            <>
              <Field label="From">
                <Select value={str("from") || "default"} onValueChange={(v) => set("from", v === "default" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Automatic sender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Automatic sender</SelectItem>
                    {senders.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Message">
                <Textarea rows={6} value={smsBody} onChange={(e) => set("body", e.target.value)} placeholder="Hi {{contact.first_name}}, thanks for joining us." />
              </Field>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{smsBody.length} characters</span>
                <span>·</span>
                <span>{smsSegments(smsBody)} segment{smsSegments(smsBody) === 1 ? "" : "s"}</span>
              </div>
              <TagRow onInsert={(t) => insertTag("body", t)} />
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-xs">Send a test to</Label>
                <Input value={str("test_phone")} onChange={(e) => set("test_phone", e.target.value)} placeholder="+1 555 000 1234" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing || !smsBody.trim() || !str("test_phone").trim()}
                  onClick={async () => {
                    setTesting(true);
                    try {
                      await onSendTest(target.stepType, config);
                    } finally {
                      setTesting(false);
                    }
                  }}
                >
                  <Send className="mr-2 h-3.5 w-3.5" /> {testing ? "Sending..." : "Send test"}
                </Button>
              </div>
            </>
          )}

          {/* ---------- SIMPLE ACTIONS ---------- */}
          {(target.stepType === "action.add_tag" || target.stepType === "action.remove_tag") && (
            <Field label="Tag"><Input value={str("tag")} onChange={(e) => set("tag", e.target.value)} placeholder="e.g. Customer" /></Field>
          )}

          {(target.stepType === "action.update_contact" || target.stepType === "action.update_opportunity") && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Field"><Input value={str("field")} onChange={(e) => set("field", e.target.value)} placeholder="status" /></Field>
              <Field label="New value"><Input value={str("value")} onChange={(e) => set("value", e.target.value)} /></Field>
            </div>
          )}

          {(target.stepType === "action.create_task" || target.stepType === "action.create_opportunity") && (
            <>
              <Field label="Title"><Input value={str("title")} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Notes"><Textarea rows={3} value={str("notes")} onChange={(e) => set("notes", e.target.value)} /></Field>
            </>
          )}

          {target.stepType === "action.assign_user" && (
            <Field label="Assign to"><Input value={str("assignee")} onChange={(e) => set("assignee", e.target.value)} placeholder="teammate@yourbrand.com" /></Field>
          )}

          {target.stepType === "action.move_pipeline_stage" && (
            <Field label="Stage"><Input value={str("stage")} onChange={(e) => set("stage", e.target.value)} placeholder="e.g. Negotiation" /></Field>
          )}

          {(target.stepType === "action.send_webhook" || target.stepType === "action.api_request") && (
            <>
              <Field label="URL"><Input value={str("url")} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/hook" /></Field>
              <Field label="Method">
                <Select value={str("method") || "POST"} onValueChange={(v) => set("method", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Body (JSON)">
                <Textarea rows={4} value={str("body_json")} onChange={(e) => set("body_json", e.target.value)} placeholder={`{"email": "{{contact.email}}"}`} />
              </Field>
            </>
          )}

          {target.stepType === "action.internal_notification" && (
            <Field label="Message"><Textarea rows={3} value={str("message")} onChange={(e) => set("message", e.target.value)} /></Field>
          )}

          {/* ---------- TIMING ---------- */}
          {target.stepType === "timing.wait" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wait for">
                <Input
                  type="number"
                  min={1}
                  value={String(config["amount"] ?? 1)}
                  onChange={(e) => set("amount", Number(e.target.value))}
                />
              </Field>
              <Field label="Unit">
                <Select value={String(config["unit"] ?? "days")} onValueChange={(v) => set("unit", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["minutes", "hours", "days", "weeks"].map((u) => (
                      <SelectItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {target.stepType === "timing.wait_until" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date"><Input type="date" value={str("until_date")} onChange={(e) => set("until_date", e.target.value)} /></Field>
                <Field label="Time"><Input type="time" value={str("until_time") || "09:00"} onChange={(e) => set("until_time", e.target.value)} /></Field>
              </div>
              <TimezoneField value={str("timezone") || "UTC"} onChange={(v) => set("timezone", v)} />
            </>
          )}

          {target.stepType === "timing.schedule" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Weekday">
                  <Select value={str("weekday") || "monday"} onValueChange={(v) => set("weekday", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => (
                        <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Time"><Input type="time" value={str("until_time") || "09:00"} onChange={(e) => set("until_time", e.target.value)} /></Field>
              </div>
              <TimezoneField value={str("timezone") || "UTC"} onChange={(v) => set("timezone", v)} />
            </>
          )}

          {/* ---------- LOGIC ---------- */}
          {(target.stepType === "logic.if_else" || target.stepType === "logic.condition_split") && (
            <ConditionList
              title="Rules"
              rows={conditions}
              onChange={setConditions}
              match={String(config["match"] ?? "all")}
              onMatchChange={(m) => set("match", m)}
            />
          )}

          {target.stepType === "logic.ab_split" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Variant A %">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={String(config["split_a"] ?? 50)}
                    onChange={(e) => {
                      const a = Math.max(0, Math.min(100, Number(e.target.value)));
                      setConfig((c) => ({ ...c, split_a: a, split_b: 100 - a }));
                    }}
                  />
                </Field>
                <Field label="Variant B %">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={String(config["split_b"] ?? 50)}
                    onChange={(e) => {
                      const b = Math.max(0, Math.min(100, Number(e.target.value)));
                      setConfig((c) => ({ ...c, split_b: b, split_a: 100 - b }));
                    }}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                {[[50, 50], [70, 30], [80, 20], [90, 10]].map(([a, b]) => (
                  <Button key={a} size="sm" variant="outline" onClick={() => setConfig((c) => ({ ...c, split_a: a, split_b: b }))}>
                    {a}/{b}
                  </Button>
                ))}
              </div>
              <TotalHint total={Number(config["split_a"] ?? 0) + Number(config["split_b"] ?? 0)} />
            </>
          )}

          {target.stepType === "logic.random_split" && (
            <RandomSplitEditor
              paths={Array.isArray(config["paths"]) ? (config["paths"] as { label: string; percent: number }[]) : []}
              onChange={(paths) => set("paths", paths)}
            />
          )}

          {target.stepType === "logic.goal" && (
            <>
              <Field label="Goal"><Input value={str("goal")} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. Purchase made" /></Field>
              <Field label="Wait for goal (days)">
                <Input type="number" min={1} value={String(config["window_days"] ?? 7)} onChange={(e) => set("window_days", Number(e.target.value))} />
              </Field>
            </>
          )}

          {target.stepType === "logic.exit" && (
            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              People who reach this step leave the automation. Nothing else runs for them.
            </p>
          )}
        </div>
      </ScrollArea>

      <Separator />
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => {
            onSave(target.id, label.trim() || def.label, config);
            toast.success("Step saved");
          }}
        >
          Save step
        </Button>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TagRow({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MERGE_TAGS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onInsert(t)}
          className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function TimezoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const zones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Africa/Lagos", "Asia/Dubai", "Asia/Kolkata"];
  return (
    <Field label="Timezone">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {zones.map((z) => (
            <SelectItem key={z} value={z}>{z}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function TotalHint({ total }: { total: number }) {
  return (
    <p className={cn("text-xs", total === 100 ? "text-muted-foreground" : "text-destructive")}>
      Total: {total}% {total === 100 ? "" : "— percentages must add up to 100%."}
    </p>
  );
}

function ConditionList({
  title,
  rows,
  onChange,
  match,
  onMatchChange,
}: {
  title: string;
  rows: Condition[];
  onChange: (rows: Condition[]) => void;
  match: string;
  onMatchChange: (m: string) => void;
}) {
  const update = (i: number, patch: Partial<Condition>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{title}</Label>
        {rows.length > 1 && (
          <Select value={match} onValueChange={onMatchChange}>
            <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Match all (AND)</SelectItem>
              <SelectItem value="any">Match any (OR)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-2.5">
            <div className="flex items-center gap-2">
              <Select value={row.field} onValueChange={(v) => update(i, { field: v })}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Choose a field" /></SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label="Remove rule">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={row.operator} onValueChange={(v) => update(i, { operator: v })}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Operator" /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!String(row.operator).includes("exist") && (
                <Input className="h-8 flex-1 text-xs" value={row.value ?? ""} onChange={(e) => update(i, { value: e.target.value })} placeholder="Value" />
              )}
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => onChange([...rows, { field: "", operator: "is", value: "" }])}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add rule
      </Button>
    </div>
  );
}

function RandomSplitEditor({
  paths,
  onChange,
}: {
  paths: { label: string; percent: number }[];
  onChange: (paths: { label: string; percent: number }[]) => void;
}) {
  const total = paths.reduce((s, p) => s + Number(p.percent || 0), 0);
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">Paths (2–5)</Label>
      {paths.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="h-8 flex-1 text-xs"
            value={p.label}
            onChange={(e) => onChange(paths.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
          />
          <Input
            type="number"
            min={0}
            max={100}
            className="h-8 w-20 text-xs"
            value={String(p.percent)}
            onChange={(e) => onChange(paths.map((x, idx) => (idx === i ? { ...x, percent: Number(e.target.value) } : x)))}
          />
          {paths.length > 2 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(paths.filter((_, idx) => idx !== i))} aria-label="Remove path">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {paths.length < 5 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...paths, { label: String.fromCharCode(65 + paths.length), percent: 0 }])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add path
        </Button>
      )}
      <TotalHint total={total} />
    </div>
  );
}

function PreviewBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <Badge variant="secondary" className="mb-2 text-[10px]">Preview</Badge>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{body || "Nothing written yet."}</p>
    </div>
  );
}
