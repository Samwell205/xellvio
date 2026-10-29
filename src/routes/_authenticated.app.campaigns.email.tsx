import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { queryOptions, useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronRight, Mail, Save, Send, Loader2, Pause, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmailDesigner, EmailTemplateChooser, templateBlocks } from "@/components/email/EmailDesigner";
import { hasEmailContent, renderEmail } from "@/lib/email-campaign-rules";
import { EmailBundles } from "@/components/email/EmailBundles";
import { emailDraftSchema, emailSenderDomain, type EmailDraft } from "@/lib/email-campaign-rules";
import { emailSetup, getEmailCampaign, saveEmailCampaign, launchEmailCampaign, sendEmailTest, changeEmailCampaignStatus } from "@/lib/email-campaigns.functions";

const setupOptions = queryOptions({ queryKey: ["email-setup"], queryFn: () => emailSetup() });
export const Route = createFileRoute("/_authenticated/app/campaigns/email")({
  head: () => ({ meta: [{ title: "Email campaign builder — Xellvio" }, { name: "description", content: "Design, review and send your business email campaigns with Xellvio." }, { property: "og:title", content: "Email campaign builder — Xellvio" }, { property: "og:description", content: "Create email designs and track your business campaigns." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s) => z.object({ id: z.string().uuid().optional() }).parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(setupOptions), component: EmailCampaignPage,
});
const STEPS = ["Details", "Templates", "Design", "Review"];
function EmailCampaignPage() {
  const { id } = Route.useSearch(); const setup = useSuspenseQuery(setupOptions).data;
  const navigate = useNavigate(); const qc = useQueryClient();
  const get = useServerFn(getEmailCampaign); const save = useServerFn(saveEmailCampaign); const launch = useServerFn(launchEmailCampaign); const test = useServerFn(sendEmailTest); const change = useServerFn(changeEmailCampaignStatus);
  const [draft, setDraft] = useState<EmailDraft | null>(null); const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [dirty, setDirty] = useState(false);
  const [testEmail, setTestEmail] = useState(""); const [schedule, setSchedule] = useState(""); const [confirm, setConfirm] = useState(false);
  const creating = useRef(false);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const q = useQuery({ queryKey: ["email-campaign", id], queryFn: () => get({ data: { id: id ?? "" } }), enabled: !!id, refetchInterval: (query) => query.state.data?.campaign.status === "draft" ? false : 10000 });
  // Draft content is restored once, never replaced by background refreshes.
  useEffect(() => {
    if (!q.data || draft?.id === q.data.campaign.id) return;
    let source: unknown = q.data.campaign;
    if (q.data.campaign.status === "draft") {
      try { const local = localStorage.getItem(`email-draft:${q.data.campaign.id}`); if (local) source = JSON.parse(local); } catch { /* stored draft unavailable */ }
    }
    const parsed = emailDraftSchema.safeParse(source); if (parsed.success) { setDraft(parsed.data); setSaved(source === q.data.campaign); setDirty(source !== q.data.campaign); }
  }, [q.data, draft?.id]);
  useEffect(() => {
    if (id || creating.current) return;
    creating.current = true;
    const c: EmailDraft = { id: crypto.randomUUID(), name: "Untitled email", subject: "", preheader: "", from_name: setup.account?.company || setup.account?.legal_business_name || "", from_email: "", reply_to: setup.account?.contact_email || setup.account?.email || "", list_id: null, postal_address: setup.account?.business_address || "", blocks: templateBlocks(0), content_mode: "design", plain_body: "", html_body: "", theme: {} };
    save({ data: c }).then(() => { setDraft(c); setSaved(true); navigate({ to: "/app/campaigns/email", search: { id: c.id }, replace: true }); }).catch((e) => { creating.current = false; toast.error(e.message); });
  }, [id, navigate, save, setup]);
  useEffect(() => {
    if (!dirty || !draft) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, draft]);
  useEffect(() => {
    if (!dirty || !draft || q.data?.campaign.status && q.data.campaign.status !== "draft") return;
    const timer = setTimeout(() => {
      const snapshot = draft;
      saveChain.current = saveChain.current.catch(() => {}).then(() => save({ data: snapshot })).then(() => {
        setDraft((latest) => { if (latest === snapshot) { setSaved(true); setDirty(false); localStorage.removeItem(`email-draft:${snapshot.id}`); } return latest; });
      }).catch((e) => toast.error(e instanceof Error ? e.message : "Draft could not be saved"));
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, draft, q.data?.campaign.status, save]);
  const current = q.data?.campaign; const status = current?.status ?? "draft";
  const editable = status === "draft";
  const verified = setup.domains.some((d) => d.status === "verified" && d.domain === emailSenderDomain(draft?.from_email ?? ""));
  const ready = !!draft?.subject.trim() && !!draft?.from_name.trim() && !!draft?.postal_address.trim() && !!draft && hasEmailContent(draft) && verified;
  function patch(values: Partial<EmailDraft>) { setDraft((d) => { if (!d) return d; const next = { ...d, ...values }; try { localStorage.setItem(`email-draft:${d.id}`, JSON.stringify(next)); } catch { /* server autosave remains available */ } return next; }); setDirty(true); setSaved(false); }
  async function saveNow() { if (!draft) return; saveChain.current = saveChain.current.catch(() => {}).then(() => save({ data: draft })); await saveChain.current; setSaved(true); setDirty(false); localStorage.removeItem(`email-draft:${draft.id}`); qc.invalidateQueries({ queryKey: ["email-campaigns"] }); }
  async function perform(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (e) { toast.error(e instanceof Error ? e.message : "Please try again"); } finally { setBusy(false); } }
  if (q.error) return <div role="alert" className="p-6 text-destructive">{q.error.message}</div>;
  if (!draft) return <div className="flex items-center gap-2 p-8"><Loader2 className="size-5 animate-spin" />Opening email draft…</div>;
  const audienceName = setup.lists.find((l) => l.id === draft.list_id)?.name ?? "All subscribed email contacts";
  const checks = [
    { key: "to", label: "To", done: true, value: audienceName, step: 0 },
    { key: "from", label: "From", done: !!draft.from_name.trim() && !!draft.from_email.trim() && verified, value: draft.from_email ? `${draft.from_name} <${draft.from_email}>${verified ? "" : " · domain not verified"}` : "Add a sender email on your verified domain", step: 0 },
    { key: "subject", label: "Subject", done: !!draft.subject.trim(), value: draft.subject || "Add a subject line", step: 0 },
    { key: "address", label: "Business address", done: !!draft.postal_address.trim(), value: draft.postal_address || "Required in every marketing email", step: 0 },
    { key: "content", label: "Content", done: hasEmailContent(draft), value: draft.content_mode === "plain" ? "Plain message" : draft.content_mode === "html" ? "Custom HTML" : `${draft.blocks.length} design blocks`, step: 2 },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const goto = (i: number) => perform(async () => { await saveNow(); setStep(i); });
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="relative overflow-hidden rounded-3xl border bg-card p-5 md:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-brand-green/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/app/campaigns"><Button size="icon" variant="ghost" title="Back to campaigns"><ArrowLeft className="size-5" /></Button></Link>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-green/12 text-brand-green"><Mail className="size-5" /></div>
          <div className="min-w-0">
            {editable ? <input aria-label="Campaign name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} className="w-full min-w-0 truncate bg-transparent text-xl font-bold outline-none focus:underline md:text-2xl" /> : <h1 className="truncate text-xl font-bold md:text-2xl">{draft.name}</h1>}
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary" className="capitalize">{status}</Badge>Email campaign</p>
          </div>
        </div>
        {editable && <div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">{saved ? "All changes saved" : "Unsaved changes"}</span><Button variant="outline" disabled={busy} onClick={() => perform(saveNow)}>{saved ? <Check className="size-4 text-brand-green" /> : <Save className="size-4" />}{saved ? "Saved" : "Save draft"}</Button></div>}
      </div>
      {editable && <nav aria-label="Email campaign steps" className="relative mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">{STEPS.map((s, i) => <Button variant="ghost" disabled={busy} key={s} onClick={() => goto(i)} aria-current={step === i ? "step" : undefined} className={`group h-auto justify-start gap-3 rounded-lg border p-3 text-left transition ${step === i ? "border-brand-green bg-brand-green/10" : "hover:bg-muted/60"}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step > i ? "bg-brand-green text-primary-foreground" : step === i ? "bg-brand-green/20 text-brand-green" : "bg-muted text-muted-foreground"}`}>{step > i ? <Check className="size-4" /> : i + 1}</span><span className="min-w-0"><span className="block text-sm font-semibold">{s}</span><span className="hidden truncate text-xs font-normal text-muted-foreground sm:block">{["Audience, sender & subject", "Choose a starting point", "Edit your email", "Test, schedule & send"][i]}</span></span></Button>)}</nav>}
    </header>
    {!editable ? <>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4"><Badge variant="secondary" className="capitalize">{status}</Badge><span className="text-sm">{current?.total.toLocaleString()} recipients</span>{current?.schedule_at && <span className="text-sm text-muted-foreground">{new Date(current.schedule_at).toLocaleString()}</span>}{["queued", "sending", "paused"].includes(status) && <><Button variant="outline" disabled={busy} onClick={() => perform(async () => { await change({ data: { id: draft.id, status: status === "paused" ? "queued" : "paused" } }); await q.refetch(); })}>{status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}{status === "paused" ? "Resume" : "Pause"}</Button><Button variant="ghost" disabled={busy} onClick={() => perform(async () => { await change({ data: { id: draft.id, status: "cancelled" } }); await q.refetch(); })}>Cancel remaining</Button></>}</div>
      {current?.last_error && <div className="flex gap-2 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{current.last_error}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{["delivered", "accepted", "queued", "unconfirmed", "bounced", "failed", "opened", "clicked"].map((metric) => <div key={metric} className="rounded-2xl border bg-card p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{metric === "accepted" ? "Accepted by email service" : metric}</div><div className={`mt-2 text-3xl font-bold tabular-nums ${metric === "delivered" ? "text-brand-green" : ""}`}>{(q.data?.report?.[metric] ?? 0).toLocaleString()}</div></div>)}</div>
      <p className="text-xs text-muted-foreground">Accepted is not confirmed delivery. Opens can include privacy-protection scans; clicks can include automated scanners.</p>
      {!!q.data?.failures.length && <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Recipient</th><th>Status</th><th>Reason</th></tr></thead><tbody>{q.data.failures.map((f, i) => <tr key={i} className="border-b last:border-0"><td className="p-3">{f.email}</td><td>{f.status}</td><td>{f.last_error}</td></tr>)}</tbody></table></div>}
    </> : <>
      {step === 1 && <EmailTemplateChooser onPick={(values) => { patch(values); setStep(2); toast.success("Template applied — ready to edit"); }} />}
      {step === 0 && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Section title="To" desc="Who receives this campaign">
            <Select value={draft.list_id ?? "all"} onValueChange={(v) => patch({ list_id: v === "all" ? null : v })}><SelectTrigger aria-label="Email audience"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All subscribed email contacts</SelectItem>{setup.lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
            <p className="text-xs text-muted-foreground">Only contacts subscribed to email receive it. Phone-only and unsubscribed contacts are skipped automatically.</p>
          </Section>
          <Section title="From" desc="How your business appears in the inbox">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Sender name" value={draft.from_name} onChange={(from_name) => patch({ from_name })} /><Field label="Sender email" type="email" value={draft.from_email} onChange={(from_email) => patch({ from_email: from_email.toLowerCase() })} /></div>
            <Field label="Reply-to email" type="email" value={draft.reply_to} onChange={(reply_to) => patch({ reply_to })} />
            {draft.from_email && !verified && <p className="flex gap-2 text-xs text-destructive"><AlertCircle className="size-4 shrink-0" />The sender email must use one of your verified domains.</p>}
          </Section>
          <Section title="Subject" desc="The first thing people read">
            <Field label="Subject line" value={draft.subject} onChange={(subject) => patch({ subject })} />
            <Field label="Preview text" value={draft.preheader} onChange={(preheader) => patch({ preheader })} />
            <div className="rounded-2xl border bg-muted/40 p-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inbox preview</p><div className="flex gap-3 rounded-xl bg-card p-3 shadow-sm"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-green/15 text-sm font-bold text-brand-green">{(draft.from_name || "Y").slice(0, 1).toUpperCase()}</div><div className="min-w-0 text-sm"><div className="truncate font-semibold">{draft.from_name || "Your business"}</div><div className="truncate font-medium">{draft.subject || "Your subject line"}</div><div className="truncate text-muted-foreground">{draft.preheader || "Your preview text appears here"}</div></div></div></div>
          </Section>
          <Section title="Business address" desc="Required by law in every marketing email"><Field label="Postal address" value={draft.postal_address} onChange={(postal_address) => patch({ postal_address })} /></Section>
        </div>
        <aside className="space-y-4">
          <div className="rounded-3xl border bg-card p-5"><h2 className="font-semibold">Sending domain</h2><div className="mt-3 space-y-2">{setup.domains.length ? setup.domains.map((d) => <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border p-3"><p className="min-w-0 break-all text-sm font-medium">{d.domain}</p><Badge variant={d.status === "verified" ? "default" : "secondary"} className={d.status === "verified" ? "bg-brand-green text-primary-foreground" : ""}>{d.status === "verified" ? "Verified" : "Pending"}</Badge></div>) : <p className="text-sm text-muted-foreground">No sending domain connected.</p>}</div><Link to="/app/email-domains"><Button variant="outline" size="sm" className="mt-3 w-full">Manage domain</Button></Link></div>
        </aside>
      </div>}
      {step === 2 && <EmailDesigner draft={draft} onChange={patch} />}
      {step === 3 && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-3xl border bg-card p-5 md:p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Ready to send?</h2><span className="text-sm text-muted-foreground">{doneCount} of {checks.length} complete</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${(doneCount / checks.length) * 100}%` }} /></div>
          <ul className="mt-5 divide-y">{checks.map((c) => <li key={c.key} className="flex items-center gap-3 py-3.5"><span className={`grid size-7 shrink-0 place-items-center rounded-full ${c.done ? "bg-brand-green text-primary-foreground" : "bg-destructive/10 text-destructive"}`}>{c.done ? <Check className="size-4" /> : <AlertCircle className="size-4" />}</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{c.label}</div><div className="truncate text-sm text-muted-foreground">{c.value}</div></div><Button variant="ghost" size="sm" onClick={() => goto(c.step)}>Edit</Button></li>)}</ul>
          <div className="mt-5 space-y-3 border-t pt-5">
            <h3 className="font-semibold">When should it go out?</h3>
            <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setSchedule("")} className={`rounded-2xl border p-4 text-left transition ${!schedule ? "border-brand-green bg-brand-green/10" : "hover:bg-muted/60"}`}><Send className="mb-2 size-4 text-brand-green" /><div className="text-sm font-semibold">Send now</div><div className="text-xs text-muted-foreground">Starts right after you confirm</div></button><button type="button" onClick={() => { if (!schedule) { const d = new Date(Date.now() + 3600_000); d.setMinutes(0, 0, 0); setSchedule(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); } }} className={`rounded-2xl border p-4 text-left transition ${schedule ? "border-brand-green bg-brand-green/10" : "hover:bg-muted/60"}`}><ChevronRight className="mb-2 size-4 text-brand-green" /><div className="text-sm font-semibold">Schedule</div><div className="text-xs text-muted-foreground">Pick a date and time</div></button></div>
            {schedule && <Input id="email-schedule" aria-label="Send time" type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} />}
            <Button size="lg" className="w-full" disabled={!ready || busy} onClick={() => setConfirm(true)}><Send className="size-4" />{schedule ? "Schedule email campaign" : "Send email campaign"}</Button>
            {!ready && <p className="text-center text-xs text-muted-foreground">Finish the items marked in red to send.</p>}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-3xl border bg-card p-5"><h2 className="font-semibold">Send a test</h2><p className="mb-3 text-xs text-muted-foreground">Check how it looks in a real inbox first.</p><Field label="Your test email address" type="email" value={testEmail} onChange={setTestEmail} /><Button variant="outline" className="mt-3 w-full" disabled={busy || !testEmail || !ready} onClick={() => perform(async () => { await saveNow(); await test({ data: { id: draft.id, email: testEmail, confirmed: true } }); toast.success("Test accepted by email service. Check your inbox; delivery is not yet confirmed."); qc.invalidateQueries({ queryKey: ["email-setup"] }); })}><Mail className="size-4" />Send test</Button><p className="mt-2 text-xs text-muted-foreground">Send only to yourself or someone who agreed to receive it. One email counts toward your allowance.</p></div>
          <div className="overflow-hidden rounded-3xl border bg-muted/40"><p className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p><iframe title="Final email preview" sandbox="" srcDoc={renderEmail(draft, "https://xellvio.com", "Alex")} className="mt-2 h-[420px] w-full border-0 bg-card" /></div>
        </aside>
      </div>}
      <div className="flex justify-between border-t pt-4"><Button variant="outline" disabled={busy || step === 0} onClick={() => goto(step - 1)}>Back</Button>{step < 3 && <Button disabled={busy} onClick={() => goto(step + 1)}>{busy && <Loader2 className="size-4 animate-spin" />}{step === 1 ? "Keep current design" : "Continue"}<ChevronRight className="size-4" /></Button>}</div>
    </>}
    {(!editable || step === 3) && <details className="group rounded-lg border bg-card p-5"><summary className="cursor-pointer list-none font-semibold">Monthly email bundle · <span className="font-normal capitalize text-muted-foreground">{setup.bundle?.plan ?? "Free"} · {setup.bundle?.used ?? 0} / {setup.bundle?.email_limit === null ? "Unlimited" : setup.bundle?.email_limit ?? 50} emails</span></summary><div className="mt-4"><EmailBundles bundle={setup.bundle} dailyCapacity={setup.dailyCapacity} /></div></details>}
    <Dialog open={confirm} onOpenChange={(v) => { if (!busy) setConfirm(v); }}><DialogContent><DialogHeader><DialogTitle>Confirm email campaign</DialogTitle></DialogHeader><p className="font-semibold">{draft.subject}</p><p className="text-sm">Send from {draft.from_email} to {setup.lists.find((l) => l.id === draft.list_id)?.name ?? "all subscribed email contacts"}. Each eligible recipient counts toward your allowance. {schedule ? `Scheduled for ${new Date(schedule).toLocaleString()}.` : "The campaign will enter the sending queue now."}</p><Button disabled={busy} onClick={() => perform(async () => { await saveNow(); const result = await launch({ data: { id: draft.id, schedule: schedule ? new Date(schedule).toISOString() : null, confirmed: true } }); setConfirm(false); toast.success(`${result.total} emails queued. Track their delivery below.`); await q.refetch(); qc.invalidateQueries({ queryKey: ["email-setup"] }); })}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Confirm {schedule ? "schedule" : "send"}</Button></DialogContent></Dialog>
  </div>;
}
function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-3xl border bg-card p-5 md:p-6"><div><h2 className="text-base font-bold">{title}</h2><p className="text-xs text-muted-foreground">{desc}</p></div>{children}</section>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) { const id = `email-${label.toLowerCase().replaceAll(" ", "-")}`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} /></div>; }