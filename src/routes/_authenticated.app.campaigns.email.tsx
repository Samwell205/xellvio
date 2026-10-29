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
import { EmailDesigner, EMAIL_TEMPLATES, templateBlocks } from "@/components/email/EmailDesigner";
import { hasEmailContent } from "@/lib/email-campaign-rules";
import { EmailBundles } from "@/components/email/EmailBundles";
import { emailDraftSchema, emailSenderDomain, type EmailDraft } from "@/lib/email-campaign-rules";
import { emailSetup, getEmailCampaign, saveEmailCampaign, launchEmailCampaign, sendEmailTest, changeEmailCampaignStatus } from "@/lib/email-campaigns.functions";

const setupOptions = queryOptions({ queryKey: ["email-setup"], queryFn: () => emailSetup() });
export const Route = createFileRoute("/_authenticated/app/campaigns/email")({
  head: () => ({ meta: [{ title: "Email campaign builder — Xellvio" }, { name: "description", content: "Design, review and send your business email campaigns with Xellvio." }, { property: "og:title", content: "Email campaign builder — Xellvio" }, { property: "og:description", content: "Create email designs and track your business campaigns." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s) => z.object({ id: z.string().uuid().optional() }).parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(setupOptions), component: EmailCampaignPage,
});
const STEPS = ["Details", "Design", "Review"];
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
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link to="/app/campaigns"><Button size="icon" variant="ghost" title="Back to campaigns"><ArrowLeft className="size-5" /></Button></Link><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Mail className="size-6 text-success" />Email campaign</h1><p className="mt-1 text-sm text-muted-foreground">{draft.name} · <span className="capitalize">{status}</span></p></div></div>{editable && <Button variant="outline" disabled={busy} onClick={() => perform(saveNow)}>{saved ? <Check className="size-4 text-success" /> : <Save className="size-4" />}{saved ? "Draft saved" : "Save draft"}</Button>}</header>
    {!editable ? <>
      <div className="flex flex-wrap items-center gap-3 border-y py-4"><Badge variant="secondary" className="capitalize">{status}</Badge><span className="text-sm">{current?.total.toLocaleString()} recipients</span>{current?.schedule_at && <span className="text-sm text-muted-foreground">{new Date(current.schedule_at).toLocaleString()}</span>}{["queued", "sending", "paused"].includes(status) && <><Button variant="outline" disabled={busy} onClick={() => perform(async () => { await change({ data: { id: draft.id, status: status === "paused" ? "queued" : "paused" } }); await q.refetch(); })}>{status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}{status === "paused" ? "Resume" : "Pause"}</Button><Button variant="ghost" disabled={busy} onClick={() => perform(async () => { await change({ data: { id: draft.id, status: "cancelled" } }); await q.refetch(); })}>Cancel remaining</Button></>}</div>
      {current?.last_error && <div className="flex gap-2 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{current.last_error}</div>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{["delivered", "accepted", "queued", "unconfirmed", "bounced", "failed", "opened", "clicked"].map((metric) => <div key={metric} className="rounded-lg border p-4"><div className="text-xs uppercase text-muted-foreground">{metric === "accepted" ? "Accepted by email service" : metric}</div><div className="mt-2 text-3xl font-semibold">{(q.data?.report?.[metric] ?? 0).toLocaleString()}</div></div>)}</div>
      <p className="text-xs text-muted-foreground">Accepted is not confirmed delivery. Opens can include privacy-protection scans; clicks can include automated scanners.</p>
      {!!q.data?.failures.length && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3">Recipient</th><th>Status</th><th>Reason</th></tr></thead><tbody>{q.data.failures.map((f, i) => <tr key={i} className="border-b"><td className="py-3">{f.email}</td><td>{f.status}</td><td>{f.last_error}</td></tr>)}</tbody></table></div>}
    </> : <>
      <nav aria-label="Email campaign steps" className="flex border-b">{STEPS.map((s, i) => <Button key={s} variant="ghost" className={`rounded-none border-b-2 ${step === i ? "border-success text-success" : "border-transparent text-muted-foreground"}`} onClick={() => perform(async () => { await saveNow(); setStep(i); })}><span className="text-xs">0{i + 1}</span>{s}</Button>)}</nav>
      {step === 0 && <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="space-y-5"><Field label="Campaign name" value={draft.name} onChange={(name) => patch({ name })} /><Field label="Subject line" value={draft.subject} onChange={(subject) => patch({ subject })} /><Field label="Preview text" value={draft.preheader} onChange={(preheader) => patch({ preheader })} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Sender name" value={draft.from_name} onChange={(from_name) => patch({ from_name })} /><Field label="Sender email" type="email" value={draft.from_email} onChange={(from_email) => patch({ from_email: from_email.toLowerCase() })} /></div><Field label="Reply-to email" type="email" value={draft.reply_to} onChange={(reply_to) => patch({ reply_to })} /><div className="space-y-2"><Label>Audience</Label><Select value={draft.list_id ?? "all"} onValueChange={(v) => patch({ list_id: v === "all" ? null : v })}><SelectTrigger aria-label="Email audience"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All subscribed email contacts</SelectItem>{setup.lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div><Field label="Business postal address" value={draft.postal_address} onChange={(postal_address) => patch({ postal_address })} /></section><aside className="space-y-5 border-l pl-5"><h2 className="font-semibold">Sending domain</h2>{setup.domains.length ? setup.domains.map((d) => <div key={d.id} className="space-y-2"><p className="break-all font-medium">{d.domain}</p><Badge variant={d.status === "verified" ? "default" : "secondary"}>{d.status === "verified" ? "Verified" : "Waiting for verification"}</Badge></div>) : <p className="text-sm text-muted-foreground">No sending domain connected.</p>}<Link to="/app/email-domains"><Button variant="outline" size="sm">Manage domain</Button></Link><div className="border-t pt-4 text-sm text-muted-foreground">Only contacts subscribed to email receive this campaign. Phone-only and unsubscribed contacts are excluded.</div><div className="border-t pt-4"><h3 className="mb-1 text-sm font-semibold">Start with a design</h3><p className="mb-3 text-xs text-muted-foreground">Or write a plain message or paste HTML in the next step.</p><div className="space-y-2">{EMAIL_TEMPLATES.slice(0, 4).map((t, i) => <Button className="w-full justify-between" variant="outline" key={t.name} onClick={() => { patch({ content_mode: "design", blocks: templateBlocks(i), theme: EMAIL_TEMPLATES[i]?.theme ?? {} }); setStep(1); }}>{t.name}<ChevronRight className="size-4" /></Button>)}</div></div></aside></div>}
      {step === 1 && <EmailDesigner draft={draft} onChange={patch} />}
      {step === 2 && <div className="grid gap-7 lg:grid-cols-2"><section className="space-y-5"><h2 className="text-xl font-semibold">Final review</h2><dl className="space-y-3 text-sm">{[["Subject", draft.subject], ["From", `${draft.from_name} <${draft.from_email}>`], ["Reply to", draft.reply_to || draft.from_email], ["Audience", setup.lists.find((l) => l.id === draft.list_id)?.name ?? "All subscribed email contacts"], ["Postal address", draft.postal_address]].map(([k, v]) => <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3" key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v || "Missing"}</dd></div>)}</dl>{!ready && <p className="flex gap-2 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />Complete your subject, sender, address, design and verified domain before sending.</p>}<div className="space-y-2 border-t pt-4"><Label htmlFor="email-schedule">Send time (leave blank to send now)</Label><Input id="email-schedule" type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></div><Button disabled={!ready || busy} onClick={() => setConfirm(true)}><Send className="size-4" />{schedule ? "Schedule email campaign" : "Send email campaign"}</Button></section><section className="space-y-4 border-l pl-5"><h2 className="font-semibold">Send a test</h2><Field label="Your test email address" type="email" value={testEmail} onChange={setTestEmail} /><Button variant="outline" disabled={busy || !testEmail || !ready} onClick={() => perform(async () => { await saveNow(); await test({ data: { id: draft.id, email: testEmail, confirmed: true } }); toast.success("Test accepted by email service. Check your inbox; delivery is not yet confirmed."); qc.invalidateQueries({ queryKey: ["email-setup"] }); })}><Mail className="size-4" />Send test</Button><p className="text-xs text-muted-foreground">Send only to yourself or someone who agreed to receive the test. One email is counted toward your monthly allowance.</p></section></div>}
      <div className="flex justify-between border-t pt-4"><Button variant="outline" disabled={busy || step === 0} onClick={() => perform(async () => { await saveNow(); setStep(step - 1); })}>Back</Button>{step < 2 && <Button disabled={busy} onClick={() => perform(async () => { await saveNow(); setStep(step + 1); })}>{busy && <Loader2 className="size-4 animate-spin" />}Continue<ChevronRight className="size-4" /></Button>}</div>
    </>}
    <EmailBundles bundle={setup.bundle} dailyCapacity={setup.dailyCapacity} />
    <Dialog open={confirm} onOpenChange={(v) => { if (!busy) setConfirm(v); }}><DialogContent><DialogHeader><DialogTitle>Confirm email campaign</DialogTitle></DialogHeader><p className="font-semibold">{draft.subject}</p><p className="text-sm">Send from {draft.from_email} to {setup.lists.find((l) => l.id === draft.list_id)?.name ?? "all subscribed email contacts"}. Each eligible recipient counts toward your allowance. {schedule ? `Scheduled for ${new Date(schedule).toLocaleString()}.` : "The campaign will enter the sending queue now."}</p><Button disabled={busy} onClick={() => perform(async () => { await saveNow(); const result = await launch({ data: { id: draft.id, schedule: schedule ? new Date(schedule).toISOString() : null, confirmed: true } }); setConfirm(false); toast.success(`${result.total} emails queued. Track their delivery below.`); await q.refetch(); qc.invalidateQueries({ queryKey: ["email-setup"] }); })}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Confirm {schedule ? "schedule" : "send"}</Button></DialogContent></Dialog>
  </div>;
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) { const id = `email-${label.toLowerCase().replaceAll(" ", "-")}`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} /></div>; }