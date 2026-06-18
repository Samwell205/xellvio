import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCampaign, runCampaign } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ReadinessBanner } from "@/components/ReadinessBanner";
import { useAccountReadiness } from "@/hooks/use-account-readiness";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, MessageSquare, Users, DollarSign, Calendar, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/campaigns/new")({
  head: () => ({ meta: [{ title: "New Campaign — Samwell Global SMS" }] }),
  component: CampaignWizard,
});

const STEPS = [
  { id: 1, name: "Audience", icon: Users },
  { id: 2, name: "Message", icon: MessageSquare },
  { id: 3, name: "Cost", icon: DollarSign },
  { id: 4, name: "Schedule", icon: Calendar },
  { id: 5, name: "Review", icon: Send },
];

type Recipient = { to: string; country?: string };

function segCount(b: string) { return b.length === 0 ? 0 : b.length <= 160 ? 1 : Math.ceil(b.length / 153); }

function CampaignWizard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const readiness = useAccountReadiness();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<"all" | "group">("all");
  const [groupId, setGroupId] = useState<string>("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const [schedule, setSchedule] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  // Senders
  const sendersQ = useQuery({
    queryKey: ["wizard-senders"],
    queryFn: async () => {
      const [{ data: nums }, { data: sids }] = await Promise.all([
        supabase.from("phone_numbers").select("e164,label,type").eq("status", "active"),
        supabase.from("sender_ids").select("sender_id").eq("status", "approved"),
      ]);
      return [
        ...(nums ?? []).map((n) => ({ value: n.e164, label: `${n.e164} · ${n.label ?? n.type}` })),
        ...(sids ?? []).map((s) => ({ value: s.sender_id, label: `${s.sender_id} (Sender ID)` })),
      ];
    },
  });

  const groupsQ = useQuery({
    queryKey: ["wizard-groups"],
    queryFn: async () => (await supabase.from("contact_groups").select("id,name").order("created_at", { ascending: false })).data ?? [],
  });

  const recipientsQ = useQuery({
    queryKey: ["wizard-recipients", audience, groupId],
    enabled: audience === "all" || (audience === "group" && !!groupId),
    queryFn: async () => {
      let q = supabase.from("contacts").select("phone,country").not("phone", "is", null).limit(10000);
      if (audience === "group" && groupId) q = q.eq("group_id", groupId);
      const { data } = await q;
      return ((data ?? []).filter((c) => c.phone && c.phone.length >= 6).map((c) => ({ to: c.phone as string, country: c.country ?? undefined })) as Recipient[]);
    },
  });

  const walletQ = useQuery({
    queryKey: ["wizard-wallet"],
    queryFn: async () => (await supabase.from("wallets").select("balance_credits").maybeSingle()).data,
  });

  const recipients = recipientsQ.data ?? [];
  const segs = segCount(body);
  const totalCost = recipients.length * segs;
  const balance = Number(walletQ.data?.balance_credits ?? 0);
  const canAfford = balance >= totalCost;

  const create = useServerFn(createCampaign);
  const run = useServerFn(runCampaign);

  const launchMut = useMutation({
    mutationFn: async () => {
      const c = await create({
        data: {
          name,
          body,
          sender_id: sender,
          recipients,
          schedule_at: schedule === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      });
      if (schedule === "now") {
        return run({ data: { campaign_id: c.id, recipients } });
      }
      return { scheduled: true, sent: 0, failed: 0 };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      if ("scheduled" in r) toast.success("Campaign scheduled");
      else toast.success(`Sent ${r.sent}, failed ${r.failed}`);
      nav({ to: "/app/campaigns" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function canAdvance(): boolean {
    if (step === 1) return !!name && (audience === "all" || !!groupId) && recipients.length > 0;
    if (step === 2) return !!body && !!sender;
    if (step === 3) return canAfford;
    if (step === 4) return schedule === "now" || (schedule === "later" && !!scheduledAt);
    return true;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/app/campaigns" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-extrabold">New campaign</h1>
        <p className="text-sm text-muted-foreground">Build, preview, and launch in a few steps.</p>
      </div>

      {!readiness.ready && <ReadinessBanner />}

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  "size-9 rounded-full grid place-items-center border text-xs font-semibold transition-colors",
                  done && "bg-success/15 text-success border-success/30",
                  active && "bg-primary text-primary-foreground border-primary",
                  !done && !active && "bg-muted text-muted-foreground border-border",
                )}
              >
                {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
              </div>
              <span className={cn("text-sm", active ? "font-semibold" : "text-muted-foreground")}>{s.name}</span>
              {idx < STEPS.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
            </div>
          );
        })}
      </div>

      <Card className="p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Campaign name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Black Friday Launch" />
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <RadioGroup value={audience} onValueChange={(v) => setAudience(v as "all" | "group")} className="grid sm:grid-cols-2 gap-3">
                <label className={cn("rounded-xl border p-4 cursor-pointer", audience === "all" && "border-primary bg-primary/5")}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all" id="aud-all" />
                    <span className="font-medium">All contacts</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">Send to every contact with a phone number.</p>
                </label>
                <label className={cn("rounded-xl border p-4 cursor-pointer", audience === "group" && "border-primary bg-primary/5")}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="group" id="aud-group" />
                    <span className="font-medium">Contact list</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">Pick a specific group.</p>
                </label>
              </RadioGroup>
            </div>
            {audience === "group" && (
              <div className="space-y-1.5">
                <Label>List</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue placeholder="Select a list" /></SelectTrigger>
                  <SelectContent>
                    {(groupsQ.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
              <span className="font-semibold">{recipients.length.toLocaleString()}</span>{" "}
              <span className="text-muted-foreground">recipients with a phone number</span>
              {recipients.length === 0 && !recipientsQ.isLoading && (
                <> · <Link to="/app/contacts" className="text-primary underline">add contacts</Link></>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>From</Label>
                {(sendersQ.data ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No approved senders yet — <Link to="/app/numbers" className="text-primary underline">manage senders</Link>.
                  </div>
                ) : (
                  <Select value={sender} onValueChange={setSender}>
                    <SelectTrigger><SelectValue placeholder="Select sender" /></SelectTrigger>
                    <SelectContent>
                      {(sendersQ.data ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{name}} — check out our Black Friday deals: example.com/bf" />
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>{body.length} chars · {segs} segment(s)</span>
                  <span>{recipients.length} recipients</span>
                </div>
              </div>
            </div>
            {/* Phone preview */}
            <div className="flex justify-center">
              <div className="w-[260px] rounded-[2rem] border-8 border-foreground/90 bg-background p-3 shadow-xl">
                <div className="rounded-2xl bg-muted/40 min-h-[420px] p-3 flex flex-col">
                  <div className="text-[10px] text-muted-foreground text-center mb-2">{sender || "Sender"}</div>
                  <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-foreground text-background text-sm px-3 py-2 whitespace-pre-wrap break-words">
                    {body || "Your message preview appears here."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Cost estimate</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <Tile label="Recipients" value={recipients.length.toLocaleString()} />
              <Tile label="Segments / msg" value={String(segs)} />
              <Tile label="Total credits" value={totalCost.toLocaleString()} highlight />
            </div>
            <div className={cn("rounded-lg border p-4 text-sm", canAfford ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
              {canAfford ? (
                <>You have <strong>{balance.toLocaleString()}</strong> credits. After this send: <strong>{(balance - totalCost).toLocaleString()}</strong>.</>
              ) : (
                <>Insufficient credits. You have {balance.toLocaleString()} but need {totalCost.toLocaleString()}. <Link to="/app/billing" className="text-primary underline">Top up</Link>.</>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <RadioGroup value={schedule} onValueChange={(v) => setSchedule(v as "now" | "later")} className="grid sm:grid-cols-2 gap-3">
              <label className={cn("rounded-xl border p-4 cursor-pointer", schedule === "now" && "border-primary bg-primary/5")}>
                <div className="flex items-center gap-2"><RadioGroupItem value="now" /><span className="font-medium">Send now</span></div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">Start delivery immediately after confirmation.</p>
              </label>
              <label className={cn("rounded-xl border p-4 cursor-pointer", schedule === "later" && "border-primary bg-primary/5")}>
                <div className="flex items-center gap-2"><RadioGroupItem value="later" /><span className="font-medium">Schedule</span></div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">Pick a future date and time.</p>
              </label>
            </RadioGroup>
            {schedule === "later" && (
              <div className="space-y-1.5">
                <Label>Send at</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Review &amp; confirm</h3>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <Row k="Name" v={name} />
              <Row k="Audience" v={audience === "all" ? "All contacts" : (groupsQ.data ?? []).find((g) => g.id === groupId)?.name ?? "Group"} />
              <Row k="Recipients" v={recipients.length.toLocaleString()} />
              <Row k="From" v={sender} />
              <Row k="Segments" v={String(segs)} />
              <Row k="Cost" v={`${totalCost.toLocaleString()} credits`} />
              <Row k="When" v={schedule === "now" ? "Immediately" : new Date(scheduledAt).toLocaleString()} />
            </dl>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{body}</div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t pt-5">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4 mr-1.5" />Back
          </Button>
          {step < 5 ? (
            <Button disabled={!canAdvance()} onClick={() => setStep((s) => s + 1)}>
              Continue<ArrowRight className="size-4 ml-1.5" />
            </Button>
          ) : (
            <Button disabled={!readiness.ready || launchMut.isPending || !canAfford} onClick={() => launchMut.mutate()}>
              {launchMut.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {schedule === "now" ? "Launch campaign" : "Schedule campaign"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", highlight && "border-primary/30 bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right">{v}</dd>
    </div>
  );
}
