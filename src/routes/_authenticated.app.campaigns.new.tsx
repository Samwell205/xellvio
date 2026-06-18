import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendTestSms } from "@/lib/sms.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Megaphone, Users, MessageSquare, CalendarClock, CheckCircle2,
  ChevronLeft, ChevronRight, Send, AlertTriangle, ShieldCheck, Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns/new")({
  head: () => ({ meta: [{ title: "New campaign — Samwell Global SMS" }] }),
  component: NewCampaignPage,
});

const STEPS = ["Audience", "Message", "Schedule", "Test", "Review"] as const;
type StepIdx = 0 | 1 | 2 | 3 | 4;

type State = {
  name: string;
  include: string[]; // segment ids
  exclude: string[];
  body: string;
  mediaUrl: string;
  sendMode: "now" | "scheduled" | "smart";
  scheduleAt: string;
  smartSkipHours: number;
  testTo: string;
  testSent: boolean;
};

const STOP_LINE = "\nReply STOP to unsubscribe.";

function NewCampaignPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepIdx>(0);
  const [s, setS] = useState<State>({
    name: "",
    include: [],
    exclude: [],
    body: "",
    mediaUrl: "",
    sendMode: "now",
    scheduleAt: "",
    smartSkipHours: 8,
    testTo: "",
    testSent: false,
  });

  const segmentsQ = useQuery({
    queryKey: ["segments-pick"],
    queryFn: async () => (await supabase.from("segments").select("id,name,query").order("name")).data ?? [],
  });

  const audience = useMemo(() => ({ include: s.include, exclude: s.exclude }), [s.include, s.exclude]);

  const estimateQ = useQuery({
    queryKey: ["campaign-estimate", audience],
    enabled: s.include.length > 0,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("eligible_profile_ids", {
        _account_id: u.user!.id,
        _audience: audience as any,
      });
      if (error) throw error;
      return (data as any[])?.length ?? 0;
    },
  });

  const bodyWithStop = useMemo(
    () => (s.body.toUpperCase().includes("STOP") ? s.body : s.body + STOP_LINE),
    [s.body],
  );
  const charCount = bodyWithStop.length;
  const isGsm = /^[\x00-\x7F]*$/.test(bodyWithStop);
  const segLen = isGsm ? 160 : 70;
  const multiSegLen = isGsm ? 153 : 67;
  const segments = charCount <= segLen ? 1 : Math.ceil(charCount / multiSegLen);

  const callTestSend = useServerFn(sendTestSms);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  async function runTestSend() {
    if (!s.testTo) { toast.error("Enter a phone number to test"); return; }
    setSending(true);
    try {
      const res = await callTestSend({ data: { to: s.testTo, body: bodyWithStop } });
      toast.success(`Test sent (sid ${res.sid.slice(0, 10)}…)`);
      setS({ ...s, testSent: true });
    } catch (e: any) {
      toast.error(e.message ?? "Test send failed");
    } finally { setSending(false); }
  }

  const canNext = (() => {
    if (step === 0) return s.name.trim().length > 0 && s.include.length > 0;
    if (step === 1) return s.body.trim().length > 0;
    if (step === 2) return s.sendMode !== "scheduled" || !!s.scheduleAt;
    if (step === 3) return s.testSent;
    return true;
  })();

  async function saveCampaign(launch: boolean) {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const status = !launch ? "draft"
        : s.sendMode === "now" ? "queued"
        : "scheduled";
      const { error } = await supabase.from("campaigns").insert({
        account_id: u.user!.id,
        name: s.name.trim(),
        audience: audience as any,
        message_body: bodyWithStop,
        media_url: s.mediaUrl || null,
        send_mode: s.sendMode,
        schedule_at: s.sendMode === "scheduled" ? new Date(s.scheduleAt).toISOString() : null,
        smart_skip_hours: s.smartSkipHours,
        status,
      });
      if (error) throw error;
      toast.success(launch ? "Campaign launched" : "Saved as draft");
      navigate({ to: "/app/campaigns" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Megaphone className="size-6" />New campaign</h1>
        <p className="text-sm text-muted-foreground">5-step builder. Compliance and test send are required.</p>
      </div>

      <Stepper step={step} />

      {step === 0 && (
        <Card className="p-5 space-y-4">
          <div>
            <Label>Campaign name</Label>
            <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="e.g. Black Friday — US" />
          </div>
          <SegmentPicker
            title="Include segments"
            segments={segmentsQ.data ?? []}
            selected={s.include}
            onChange={(ids) => setS({ ...s, include: ids })}
          />
          <SegmentPicker
            title="Exclude segments (optional)"
            segments={segmentsQ.data ?? []}
            selected={s.exclude}
            onChange={(ids) => setS({ ...s, exclude: ids })}
          />
          <Card className="p-4 flex items-center justify-between bg-primary/5 border-primary/30">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Users className="size-5" /></div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wide">Eligible audience</div>
                <div className="text-2xl font-extrabold">{s.include.length === 0 ? "—" : (estimateQ.isFetching ? "…" : estimateQ.data ?? 0)}</div>
                <div className="text-xs text-muted-foreground">subscribed, not on suppression list</div>
              </div>
            </div>
            {s.include.length === 0 && <span className="text-xs text-muted-foreground">Pick at least one include segment.</span>}
          </Card>
          {(segmentsQ.data?.length ?? 0) === 0 && (
            <div className="text-sm text-muted-foreground">
              You have no segments yet. <Link to="/app/segments/new" className="text-primary underline">Create one</Link>.
            </div>
          )}
        </Card>
      )}

      {step === 1 && (
        <div className="grid md:grid-cols-2 gap-5">
          <Card className="p-5 space-y-4">
            <div>
              <Label>Message body</Label>
              <Textarea value={s.body} onChange={(e) => setS({ ...s, body: e.target.value })}
                rows={6} placeholder="Hi {{first_name}}, our sale starts now…" />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>{isGsm ? "GSM-7" : "Unicode"} · {charCount} chars · {segments} SMS segment{segments > 1 ? "s" : ""}</span>
                <span>Personalization: <code>{"{{first_name}}"}</code> <code>{"{{last_name}}"}</code></span>
              </div>
            </div>
            <div>
              <Label>Media URL (MMS, optional)</Label>
              <Input value={s.mediaUrl} onChange={(e) => setS({ ...s, mediaUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-success/5 border border-success/30 rounded-md p-3">
              <ShieldCheck className="size-4 text-success mt-0.5" />
              <div>Opt-out line is auto-appended if missing: <i>"Reply STOP to unsubscribe."</i></div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-3 flex items-center gap-1"><Smartphone className="size-4" /> Phone preview</div>
            <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border bg-card p-3 shadow-sm">
              <div className="rounded-2xl bg-muted/40 p-3 min-h-[180px] text-sm whitespace-pre-wrap">
                {bodyWithStop || <span className="text-muted-foreground">Your message will appear here…</span>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {step === 2 && (
        <Card className="p-5 space-y-4">
          <Label>When to send</Label>
          <RadioGroup value={s.sendMode} onValueChange={(v) => setS({ ...s, sendMode: v as State["sendMode"] })} className="space-y-2">
            {[
              { v: "now", label: "Send now", desc: "Dispatch immediately after launch." },
              { v: "scheduled", label: "Schedule for later", desc: "Pick an exact date and time." },
              { v: "smart", label: "Smart send time", desc: "Skip quiet hours per recipient timezone." },
            ].map((opt) => (
              <label key={opt.v} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${s.sendMode === opt.v ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value={opt.v} className="mt-0.5" />
                <div>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
          {s.sendMode === "scheduled" && (
            <div>
              <Label>Date and time</Label>
              <Input type="datetime-local" value={s.scheduleAt} onChange={(e) => setS({ ...s, scheduleAt: e.target.value })} />
            </div>
          )}
          {s.sendMode === "smart" && (
            <div>
              <Label>Skip hours (quiet window)</Label>
              <Input type="number" min={0} max={12} value={s.smartSkipHours}
                onChange={(e) => setS({ ...s, smartSkipHours: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground mt-1">Avoid sending in the recipient's late-night / early-morning hours.</p>
            </div>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-md p-3 text-sm">
            <AlertTriangle className="size-4 text-warning mt-0.5" />
            <div>A test send is <b>required</b> before you can schedule or launch a campaign.</div>
          </div>
          <div>
            <Label>Send test to (E.164 phone)</Label>
            <div className="flex gap-2 mt-1">
              <Input value={s.testTo} onChange={(e) => setS({ ...s, testTo: e.target.value })} placeholder="+15551234567" />
              <Button onClick={runTestSend} disabled={sending || !s.body.trim()}>
                <Send className="size-4 mr-1.5" />{sending ? "Sending…" : "Send test"}
              </Button>
            </div>
            {s.testSent && (
              <div className="text-sm text-success mt-2 flex items-center gap-1"><CheckCircle2 className="size-4" /> Test sent. You can proceed.</div>
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <ReviewItem label="Name" value={s.name} />
            <ReviewItem label="Eligible audience" value={String(estimateQ.data ?? 0)} />
            <ReviewItem label="Send mode" value={s.sendMode} />
            <ReviewItem label="Schedule" value={s.sendMode === "scheduled" ? new Date(s.scheduleAt).toLocaleString() : "—"} />
            <ReviewItem label="Segments" value={`${segments} × ${isGsm ? "GSM" : "Unicode"}`} />
            <ReviewItem label="Media" value={s.mediaUrl || "—"} />
          </div>
          <div>
            <Label>Final message</Label>
            <Card className="p-3 mt-1 bg-muted/30 whitespace-pre-wrap text-sm">{bodyWithStop}</Card>
          </div>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((step - 1) as StepIdx)}>
          <ChevronLeft className="size-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          {step === 4 ? (
            <>
              <Button variant="outline" onClick={() => saveCampaign(false)} disabled={saving}>Save as draft</Button>
              <Button onClick={() => saveCampaign(true)} disabled={saving}>
                {s.sendMode === "now" ? "Launch now" : "Schedule"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setStep((step + 1) as StepIdx)} disabled={!canNext}>
              Next <ChevronRight className="size-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const icons = [Users, MessageSquare, CalendarClock, Send, CheckCircle2];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {STEPS.map((label, i) => {
        const Icon = icons[i];
        const active = i === step;
        const done = i < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border ${active ? "bg-primary text-primary-foreground border-primary" : done ? "bg-success/15 text-success border-success/30" : "bg-card border-border text-muted-foreground"}`}>
              <Icon className="size-4" />{label}
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function SegmentPicker({ title, segments, selected, onChange }: {
  title: string; segments: { id: string; name: string; query: any }[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="grid sm:grid-cols-2 gap-2 mt-1">
        {segments.length === 0 && <div className="text-xs text-muted-foreground">No segments available.</div>}
        {segments.map((seg) => {
          const on = selected.includes(seg.id);
          return (
            <label key={seg.id} className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${on ? "border-primary bg-primary/5" : ""}`}>
              <Checkbox checked={on} onCheckedChange={(v) => onChange(v ? [...selected, seg.id] : selected.filter((x) => x !== seg.id))} className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-sm">{seg.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(seg.query?.country_in ?? []).map((c: string) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}
