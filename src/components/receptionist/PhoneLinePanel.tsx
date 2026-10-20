import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Bot, Check, FileText, Loader2, MessageSquare, Phone, PhoneForwarded, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { textingPath } from "@/lib/receptionist/shared";
import { AssistedNumberPanel } from "./AssistedNumberPanel";
import {
  buyReceptionistNumber,
  getReceptionistNumberRequirements,
  refreshReceptionistNumber,
  searchReceptionistNumbers,
  setupReceptionistAgent,
  submitReceptionistPaperwork,
} from "@/lib/receptionist.functions";

type NumberRow = { phoneNumber: string; type: string; locality: string | null; canCall: boolean; canText: boolean; monthlyUsd: number };
type Req = { id: string; name: string; kind: "textual" | "address" | "document" | "action"; description: string; example: string | null };
type NumType = "mobile" | "local" | "national" | "toll-free";

const COUNTRIES = [["GB", "United Kingdom"], ["US", "United States"], ["CA", "Canada"], ["IE", "Ireland"], ["AU", "Australia"], ["NL", "Netherlands"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["SE", "Sweden"]] as const;
const TYPES: { value: NumType; title: string; hint: string }[] = [
  { value: "mobile", title: "Mobile", hint: "Usually calls and texts" },
  { value: "local", title: "Local", hint: "City number, builds local trust" },
  { value: "national", title: "National", hint: "Not tied to one city" },
  { value: "toll-free", title: "Freephone", hint: "Free for callers to ring" },
];
const STATUS: Record<string, string> = {
  verified: "Active", number_pending: "Being activated", documents_needed: "Paperwork under review",
  documents_rejected: "Paperwork needs fixing", number_failed: "Order failed", not_configured: "No number yet",
};

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function StepHeader({ n, title, active, done }: { n: number; title: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("flex size-7 items-center justify-center rounded-full border text-xs font-semibold", done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "text-muted-foreground")}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <span className={cn("text-sm font-medium", !active && !done && "text-muted-foreground")}>{title}</span>
    </div>
  );
}

export function PhoneLinePanel({ data, onChange }: {
  data: {
    isOwner: boolean; number: string | null; numberType: string | null; numberCountry?: string | null; provisionStatus: string;
    regulatoryNotes?: string | null; billingStatus?: string; renewsAt?: string | null;
    hasAgent: boolean; enabled: boolean; testVerified?: boolean; perMinuteUsd: number; numberMonthlyUsd: number; config: { businessName: string; phoneMode: string };
  };
  onChange: () => Promise<unknown> | void;
}) {
  const search = useServerFn(searchReceptionistNumbers);
  const buy = useServerFn(buyReceptionistNumber);
  const refresh = useServerFn(refreshReceptionistNumber);
  const agent = useServerFn(setupReceptionistAgent);
  const loadReqs = useServerFn(getReceptionistNumberRequirements);
  const sendPaperwork = useServerFn(submitReceptionistPaperwork);

  const [country, setCountry] = useState("GB");
  const [type, setType] = useState<NumType>("mobile");
  const [region, setRegion] = useState("");
  const [results, setResults] = useState<NumberRow[]>([]);
  const [picked, setPicked] = useState<NumberRow | null>(null);
  const [reqs, setReqs] = useState<{ requirements: Req[]; paperworkDone: boolean } | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [confirm, setConfirm] = useState(false);

  const searchMut = useMutation({
    mutationFn: () => search({ data: { country, type, region: region || undefined } }),
    onSuccess: (r) => { setResults(r); setPicked(null); setReqs(null); if (!r.length) toast.message("No numbers found — try another type or area"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pickMut = useMutation({
    mutationFn: (n: NumberRow) => loadReqs({ data: { country, type } }).then((r) => ({ n, r })),
    onSuccess: ({ n, r }) => { setPicked(n); setReqs(r); setValues({}); },
    onError: (e: Error) => toast.error(e.message),
  });
  const paperworkMut = useMutation({
    mutationFn: async () => {
      const list = await Promise.all((reqs?.requirements ?? []).map(async (q) => {
        const v = values[q.id];
        if (q.kind === "document") {
          if (!(v instanceof File)) throw new Error(`Please upload: ${q.name}`);
          if (v.size > 8 * 1024 * 1024) throw new Error(`${q.name}: file must be under 8 MB`);
          return { requirementId: q.id, kind: "document" as const, file: { name: v.name, base64: await readFile(v) } };
        }
        if (q.kind === "address") return { requirementId: q.id, kind: "address" as const, address: { region: "", ...(v ?? {}), country } };
        return { requirementId: q.id, kind: "textual" as const, text: String(v ?? "") };
      }));
      return sendPaperwork({ data: { country, type, values: list } });
    },
    onSuccess: () => { toast.success("Paperwork saved — it will be checked when you buy"); setReqs((r) => r && { ...r, paperworkDone: true }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const buyMut = useMutation({
    mutationFn: () => { if (!picked) throw new Error("Choose a number first"); return buy({ data: { phoneNumber: picked.phoneNumber, type, country, confirmed: true } }); },
    onSuccess: async (r) => { setConfirm(false); setResults([]); setPicked(null); toast.success(r.status === "verified" ? `${r.phoneNumber} is active` : `${r.phoneNumber} ordered — ${STATUS[r.status] ?? r.status}`); await onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const refreshMut = useMutation({ mutationFn: () => refresh(), onSuccess: async () => { await onChange(); }, onError: (e: Error) => toast.error(e.message) });
  const agentMut = useMutation({
    mutationFn: () => agent(),
    onSuccess: async (r) => { toast.success(r.updated ? "AI agent updated" : "AI agent created"); await onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsPaperwork = Boolean(reqs?.requirements.length);
  const paperworkReady = !needsPaperwork || reqs?.paperworkDone;
  const step = !picked ? 1 : !paperworkReady ? 2 : 3;

  return (
    <section className="grid gap-6 border-b pb-8 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-lg font-semibold">Phone line & AI agent</h2>
        <p className="mt-1 text-sm text-muted-foreground">${data.numberMonthlyUsd.toFixed(2)}/month per number · ${data.perMinuteUsd.toFixed(2)}/minute answered</p>
        <p className="mt-3 text-xs text-muted-foreground">Phone carriers check every new number. Calls and texts switch on as each check passes — we show you exactly where you are.</p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5"><Bot className="size-5 text-primary" /></div>
            <div>
              <p className="font-medium">AI phone agent</p>
              <p className="text-sm text-muted-foreground">{data.hasAgent ? "Created. Update after saving changes to business details." : "Save your business details below, then create the agent."}</p>
            </div>
          </div>
          <Button type="button" disabled={!data.isOwner || data.enabled || agentMut.isPending} onClick={() => agentMut.mutate()}>
            {agentMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}{data.hasAgent ? "Update agent" : "Create AI agent"}
          </Button>
        </div>

        {data.number ? <ActiveNumber data={data} refreshing={refreshMut.isPending} onRefresh={() => refreshMut.mutate()} /> : (
          <div className="space-y-5 rounded-lg border bg-card p-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <StepHeader n={1} title="Choose a number" active={step === 1} done={step > 1} />
              <StepHeader n={2} title="Business paperwork" active={step === 2} done={step > 2} />
              <StepHeader n={3} title="Buy" active={step === 3} done={false} />
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <div className="space-y-1.5"><Label>Country</Label>
                <Select value={country} onValueChange={(v) => { setCountry(v); setResults([]); setPicked(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRIES.map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>City or area (optional)</Label><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Manchester" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {TYPES.map((t) => (
                <Button key={t.value} variant="outline" aria-pressed={type === t.value} type="button" onClick={() => { setType(t.value); setResults([]); setPicked(null); }}
                  className={cn("h-auto flex-col items-start whitespace-normal rounded-lg border p-3 text-left transition-colors hover:border-primary/60", type === t.value && "border-primary bg-primary/5 ring-1 ring-primary")}>
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>
                </Button>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={!data.isOwner || searchMut.isPending} onClick={() => searchMut.mutate()}>
              {searchMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}Find available numbers
            </Button>

            {results.length > 0 && (
              <div className="max-h-80 divide-y overflow-auto rounded-lg border">
                {results.map((n) => (
                  <Button key={n.phoneNumber} variant="ghost" type="button" onClick={() => pickMut.mutate(n)} disabled={pickMut.isPending}
                    className={cn("flex h-auto w-full items-center justify-between gap-3 rounded-none p-3 text-left text-sm hover:bg-muted/50", picked?.phoneNumber === n.phoneNumber && "bg-primary/5")}>
                    <div>
                      <div className="font-mono">{n.phoneNumber}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {n.locality && <Badge variant="outline" className="font-normal">{n.locality}</Badge>}
                        <Badge variant="secondary" className="gap-1 font-normal"><Phone className="size-3" />Calls</Badge>
                        {n.canText && <Badge variant="secondary" className="gap-1 font-normal"><MessageSquare className="size-3" />Texts</Badge>}
                      </div>
                    </div>
                    {picked?.phoneNumber === n.phoneNumber ? <Check className="size-4 text-primary" /> : <span className="text-xs text-muted-foreground">${n.monthlyUsd.toFixed(2)}/mo</span>}
                  </Button>
                ))}
              </div>
            )}

            {picked && reqs && needsPaperwork && (
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{reqs.paperworkDone ? "Paperwork saved for this number type" : "The carrier needs these details before this number can be used"}</p>
                    <p className="text-xs text-muted-foreground">These rules are set by the country's telecoms regulator. Approval times depend on the country, number type and documents.</p>
                  </div>
                </div>
                {!reqs.paperworkDone && (
                  <>
                    {reqs.requirements.map((q) => (
                      <div key={q.id} className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">{q.kind === "document" ? <FileText className="size-3.5" /> : null}{q.name}</Label>
                        <p className="text-xs text-muted-foreground line-clamp-3">{q.description}</p>
                        {q.kind === "document" && (
                          <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50">
                            <Upload className="size-4" />{values[q.id]?.name ?? "Upload PDF or photo"}
                            <input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.files?.[0] }))} />
                          </label>
                        )}
                        {q.kind === "textual" && <Textarea rows={2} value={values[q.id] ?? ""} placeholder={q.example ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))} />}
                        {q.kind === "address" && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {([["firstName", "First name"], ["lastName", "Last name"], ["businessName", "Business name"], ["street", "Street address"], ["city", "City"], ["region", "County / state"], ["postalCode", "Postcode"]] as const).map(([k, l]) => (
                              <Input key={k} placeholder={l} value={values[q.id]?.[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [q.id]: { ...(v[q.id] ?? {}), [k]: e.target.value } }))} />
                            ))}
                          </div>
                        )}
                        {q.kind === "action" && <p className="text-xs text-muted-foreground">Our team completes this step for you after purchase.</p>}
                      </div>
                    ))}
                    <Button type="button" disabled={paperworkMut.isPending} onClick={() => paperworkMut.mutate()}>
                      {paperworkMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save paperwork
                    </Button>
                  </>
                )}
              </div>
            )}

            {picked && paperworkReady && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
                <div className="text-sm"><span className="font-mono font-medium">{picked.phoneNumber}</span> <span className="text-muted-foreground">· ${picked.monthlyUsd.toFixed(2)}/month</span></div>
                <Button type="button" onClick={() => setConfirm(true)}>Buy this number</Button>
              </div>
            )}
          </div>
        )}
        <AssistedNumberPanel country={data.numberCountry ?? country} numberType={(data.numberType as NumType | null) ?? type} phoneNumber={data.number ?? picked?.phoneNumber} isOwner={data.isOwner} />
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buy {picked?.phoneNumber}?</DialogTitle>
            <DialogDescription>We order exactly this number from the carrier.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• ${picked?.monthlyUsd.toFixed(2)} from your credits now, then every month.</li>
            <li>• Answered calls cost ${data.perMinuteUsd.toFixed(2)} per minute.</li>
            <li>• {picked && texting(country, type, picked.canText)}</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button disabled={buyMut.isPending} onClick={() => buyMut.mutate()}>{buyMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Confirm purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function texting(country: string, type: string, canText: boolean) {
  const p = textingPath(country, type, canText);
  if (p === "calls_only") return "This number takes calls only — it can't send texts.";
  if (p === "tollfree_verification") return "Texts switch on after toll-free verification is approved (approval time varies).";
  if (p === "tendlc_registration") return "Texts need a business (10DLC) registration first — our team will help.";
  return "SMS capability is available; messaging setup and any required verification must be completed first.";
}

function ActiveNumber({ data, refreshing, onRefresh }: { data: any; refreshing: boolean; onRefresh: () => void }) {
  const country = data.numberCountry ?? "GB";
  const type = data.numberType ?? "local";
  const canText = type === "mobile" || (country !== "GB" && type !== "national");
  const path = textingPath(country, type, canText);
  const active = data.provisionStatus === "verified";
  const stages = [
    { title: "Number ordered", done: true, note: "Reserved for your business" },
    { title: "Carrier checks", done: active, note: active ? "Approved" : STATUS[data.provisionStatus] ?? "In progress", warn: data.provisionStatus === "documents_rejected" || data.provisionStatus === "number_failed" },
    { title: "Calls", done: active && data.hasAgent && data.enabled, note: !active ? "Waiting for carrier checks" : data.hasAgent ? (data.enabled ? "Answering calls" : data.testVerified ? "Paused — test call verified" : "Pilot verification required") : "Create your AI agent" },
    { title: "Texts", done: false, note: path === "calls_only" ? "Not available on this number type" : !active ? "Waiting for carrier checks" : path === "ready" ? "Complete messaging setup" : path === "tollfree_verification" ? "Needs toll-free verification" : "Needs business registration" },
  ];
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Phone className="size-5 text-primary" />
        <span className="font-mono text-lg">{data.number}</span>
        <Badge variant={active ? "default" : "secondary"}>{STATUS[data.provisionStatus] ?? data.provisionStatus}</Badge>
        {!active && <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}><RefreshCw className={cn("mr-1.5 size-3.5", refreshing && "animate-spin")} />Check status</Button>}
      </div>

      <ol className="grid gap-2 sm:grid-cols-4">
        {stages.map((s) => (
          <li key={s.title} className={cn("rounded-lg border p-3", s.done && "border-primary/40 bg-primary/5", s.warn && "border-destructive/50 bg-destructive/5")}>
            <div className="flex items-center gap-1.5 text-sm font-medium">{s.done ? <Check className="size-4 text-primary" /> : s.warn ? <AlertTriangle className="size-4 text-destructive" /> : <span className="size-2 rounded-full bg-muted-foreground/40" />}{s.title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
          </li>
        ))}
      </ol>

      {data.regulatoryNotes && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="font-medium">The carrier asked for changes</p><p className="mt-1 whitespace-pre-line text-muted-foreground">{data.regulatoryNotes}</p><p className="mt-2 text-xs text-muted-foreground">Open a support request with the corrected document and we'll resubmit it.</p></div>}
      {data.billingStatus === "past_due" && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">Your monthly number fee couldn't be taken. Calls are paused — <Link to="/app/billing" className="font-medium underline">add credits</Link> and it will retry automatically within the hour.</div>}
      {data.renewsAt && data.billingStatus !== "past_due" && <p className="text-xs text-muted-foreground">Next ${Number(data.numberMonthlyUsd).toFixed(2)} charge: {new Date(data.renewsAt).toLocaleDateString()}</p>}
      {active && path === "tollfree_verification" && <Button asChild size="sm" variant="outline"><Link to="/app/toll-free-verification">Start toll-free verification</Link></Button>}

      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium"><PhoneForwarded className="size-4" />Send missed calls here (keep your existing number)</p>
        <p className="mt-1 text-muted-foreground">Forward <b>unanswered or busy</b> calls from your usual phone to <span className="font-mono">{data.number}</span>. Or give customers this number directly.</p>
        <p className="mt-2 text-xs text-muted-foreground">Ask your phone provider to enable conditional forwarding for unanswered, busy or unreachable calls. Dial codes vary by provider and phone plan.</p>
        <p className="mt-2 text-xs text-muted-foreground">Landlines and office phone systems: turn on "forward on no answer" in your provider's settings.</p>
      </div>
    </div>
  );
}
