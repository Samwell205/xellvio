import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MessageSquareText, Sparkles, Upload, Clock, AlertCircle } from "lucide-react";
import { getMySenderAssets, refreshMyVerificationStatus } from "@/lib/sender-setup.functions";
import { sendTestSms } from "@/lib/sms.functions";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/setup-sms")({
  head: () => ({ meta: [{ title: "Set up SMS — Samwell Global SMS" }] }),
  component: SetupSmsPage,
});

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "GH", name: "Ghana" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "IN", name: "India" },
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
];

const VOLUMES = [
  { v: 1000, label: "Under 1,000 / month" },
  { v: 10000, label: "1,000 – 10,000 / month" },
  { v: 100000, label: "10,000 – 100,000 / month" },
  { v: 1000000, label: "100,000+ / month" },
];

function SetupSmsPage() {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshMyVerificationStatus);
  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () => (await supabase.from("accounts").select("*").maybeSingle()).data,
  });
  const assetsFn = useServerFn(getMySenderAssets);
  const assets = useQuery({ queryKey: ["sender-assets"], queryFn: () => assetsFn(), refetchInterval: 30_000 });

  const refreshMut = useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sender-assets"] }),
  });

  if (account.isLoading) return <div className="flex justify-center h-64 items-center"><Loader2 className="size-6 animate-spin" /></div>;
  const a = account.data;
  const hasAssets = (assets.data?.length ?? 0) > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><MessageSquareText className="size-6 text-primary" /> Set up SMS</h1>
        <p className="text-sm text-muted-foreground">Answer a few questions and we'll handle the rest. Most setups are ready in 7–10 business days.</p>
      </div>

      {hasAssets ? (
        <SenderStatusList assets={assets.data ?? []} accountPhone={a?.phone ?? undefined} onRefresh={() => refreshMut.mutate()} refreshing={refreshMut.isPending} />
      ) : (
        <Wizard account={a} onDone={() => { qc.invalidateQueries({ queryKey: ["sender-assets"] }); qc.invalidateQueries({ queryKey: ["account"] }); }} />
      )}
    </div>
  );
}

function SenderStatusList({ assets, accountPhone, onRefresh, refreshing }: { assets: any[]; accountPhone?: string; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="space-y-3">
      {assets.map((s) => <StatusCard key={s.id} asset={s} accountPhone={accountPhone} />)}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing && <Loader2 className="size-4 animate-spin mr-2" />}Check for updates
        </Button>
      </div>
    </div>
  );
}


function senderKindLabel(kind: string) {
  if (kind === "toll_free") return "Toll-free number";
  if (kind === "sender_id") return "Alphanumeric Sender ID";
  return "Local long-code number";
}

function StatusCard({ asset, accountPhone }: { asset: any; accountPhone?: string }) {
  const status = asset.verification_status as string;
  const kindLabel = senderKindLabel(asset.sender_kind);
  const identifierLabel = asset.sender_kind === "sender_id" ? "Sender ID" : "Number";
  if (status === "verified") {
    return (
      <Card className="p-5 border-success/40 bg-success/5 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-success" />
          <div className="flex-1">
            <div className="font-semibold">Your sender is ready</div>
            <div className="text-sm text-muted-foreground">
              {asset.country_code} · {kindLabel}
            </div>
            <div className="text-sm mt-1">
              <span className="text-muted-foreground">{identifierLabel}:</span>{" "}
              <span className="font-mono font-semibold">{asset.phone_number}</span>
            </div>
          </div>
          <Badge variant="default">Active</Badge>
        </div>
        <TestSendInline defaultPhone={accountPhone} country={asset.country_code} />
      </Card>
    );
  }
  if (status === "rejected") {
    return (
      <Card className="p-5 border-destructive/40 bg-destructive/5">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-6 text-destructive shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">We need a bit more info ({asset.country_code})</div>
            <div className="text-sm text-muted-foreground mt-1">{asset.friendly_rejection_reason ?? "Please update your details and try again."}</div>
            <Link to="/app/setup-sms"><Button size="sm" className="mt-3">Update and resubmit</Button></Link>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5 border-primary/40 bg-primary/5">
      <div className="flex items-center gap-3">
        <Clock className="size-6 text-primary" />
        <div className="flex-1">
          <div className="font-semibold">Setting up your sender ({asset.country_code} · {kindLabel})</div>
          <div className="text-sm text-muted-foreground">
            {asset.phone_number ? <>Provisioned {identifierLabel.toLowerCase()}: <span className="font-mono">{asset.phone_number}</span> · </> : null}
            Carrier review usually takes 7–10 business days. You can build campaigns while you wait.
          </div>
        </div>
        <Badge variant="secondary">In review</Badge>
      </div>
    </Card>
  );
}

function TestSendInline({ defaultPhone, country }: { defaultPhone?: string; country?: string } = {}) {
  const send = useServerFn(sendTestSms);
  const [to, setTo] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; from?: string } | null>(null);
  async function run() {
    if (!to.match(/^\+[1-9][0-9]{6,14}$/)) {
      toast.error("Enter your number in international format, e.g. +15551234567");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await send({ data: { to, body: "Test from Samwell Global SMS — your sender is working ✅ Reply STOP to opt out.", country } });
      const msg = `Sent from ${r.from} (${r.country} · ${r.sender_kind.replace("_"," ")}) — status: ${r.status}`;
      setResult({ ok: true, msg, from: r.from });
      toast.success(msg);
    } catch (e: any) {
      const m = e?.message ?? "Test send failed";
      setResult({ ok: false, msg: m });
      toast.error(m);
    } finally { setBusy(false); }
  }
  return (
    <div className="border-t pt-4">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Test / Verify Sender ID</Label>
      <p className="text-xs text-muted-foreground mb-2">Sends one real SMS from your provisioned sender to confirm everything is working.</p>
      <div className="flex gap-2">
        <Input placeholder="+15551234567" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Send className="size-4 mr-1.5" />}
          Send test
        </Button>
      </div>
      {result && (
        <div className={`mt-2 text-xs rounded-md px-3 py-2 ${result.ok ? "bg-success/10 text-success-foreground border border-success/30" : "bg-destructive/10 text-destructive border border-destructive/30"}`}>
          {result.ok ? "✅ " : "⚠️ "}{result.msg}
        </div>
      )}
    </div>
  );
}


type WizardForm = {
  legal_business_name: string;
  business_address: string;
  business_reg_number: string;
  website_url: string;
  privacy_policy_url: string;
  contact_email: string;
  targetCountries: string[];
  monthlyVolume: number;
  useCase: string;
  sampleMessage: string;
  optInDescription: string;
  optInScreenshotPath: string;
};

function Wizard({ account, onDone }: { account: any; onDone: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<WizardForm>({
    legal_business_name: account?.legal_business_name ?? "",
    business_address: account?.business_address ?? "",
    business_reg_number: account?.business_reg_number ?? "",
    website_url: account?.website_url ?? "",
    privacy_policy_url: account?.privacy_policy_url ?? "",
    contact_email: account?.contact_email ?? account?.email ?? "",
    targetCountries: account?.sms_target_countries?.length ? account.sms_target_countries : ["US"],
    monthlyVolume: account?.monthly_volume_estimate ?? 10000,
    useCase: account?.use_case_description ?? "",
    sampleMessage: account?.sample_message ?? "",
    optInDescription: account?.opt_in_description ?? "",
    optInScreenshotPath: account?.opt_in_screenshot_url ?? "",
  });

  useEffect(() => {
    if (account) setForm((f) => ({ ...f, legal_business_name: account.legal_business_name ?? f.legal_business_name }));
  }, [account]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const path = `${u.user.id}/optin-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("opt-in-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      setForm((f) => ({ ...f, optInScreenshotPath: path }));
      toast.success("Screenshot uploaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("accounts").update({
        legal_business_name: form.legal_business_name,
        business_address: form.business_address,
        business_reg_number: form.business_reg_number,
        website_url: form.website_url,
        privacy_policy_url: form.privacy_policy_url || null,
        contact_email: form.contact_email,
      }).eq("id", u.user.id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runSetup = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again, then retry SMS setup.");
      const res = await fetch("/api/setup-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
        targetCountries: form.targetCountries,
        monthlyVolume: form.monthlyVolume,
        useCase: form.useCase,
        sampleMessage: form.sampleMessage,
        optInDescription: form.optInDescription,
        optInScreenshotPath: form.optInScreenshotPath || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Could not set up SMS. Please try again.");
      return json;
    },
    onSuccess: (r: any) => {
      if (r?.errors?.length) {
        for (const e of r.errors) toast.error(`${e.cc}: ${e.reason}`);
      }
      if (r?.created?.length) {
        toast.success(`Set up ${r.created.length} sender${r.created.length === 1 ? "" : "s"}. We'll email you when verification completes.`);
      }
      onDone();
    },
    onError: (e: Error) => toast.error(e.message || "Could not set up SMS. Please try again."),
  });

  function toggleCountry(cc: string) {
    setForm((f) => ({ ...f, targetCountries: f.targetCountries.includes(cc) ? f.targetCountries.filter((x) => x !== cc) : [...f.targetCountries, cc] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <StepDot n={1} active={step === 1} done={step > 1} label="Confirm business" />
        <div className="h-px flex-1 bg-border" />
        <StepDot n={2} active={step === 2} done={step > 2} label="Tell us about your SMS" />
        <div className="h-px flex-1 bg-border" />
        <StepDot n={3} active={step === 3} done={false} label="Set up" />
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Confirm your business details</h3>
          <p className="text-sm text-muted-foreground">We pre-filled these from your account. Edit if anything's changed.</p>
          <Field label="Legal business name" v={form.legal_business_name} on={(v) => setForm({ ...form, legal_business_name: v })} />
          <div className="space-y-1.5">
            <Label>Business address</Label>
            <Textarea value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} rows={2} placeholder="Street, City, State, ZIP" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Business registration #" v={form.business_reg_number} on={(v) => setForm({ ...form, business_reg_number: v })} />
            <Field label="Website" v={form.website_url} on={(v) => setForm({ ...form, website_url: v })} placeholder="https://" />
            <Field label="Privacy policy URL" v={form.privacy_policy_url} on={(v) => setForm({ ...form, privacy_policy_url: v })} placeholder="https://" />
            <Field label="Contact email" v={form.contact_email} on={(v) => setForm({ ...form, contact_email: v })} type="email" />
          </div>
          <div className="flex justify-end">
            <Button onClick={async () => { await saveProfile.mutateAsync(); setStep(2); }} disabled={saveProfile.isPending}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-5">
          <h3 className="font-semibold">Tell us about your SMS program</h3>

          <div className="space-y-2">
            <Label>Which countries will you send to?</Label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => {
                const on = form.targetCountries.includes(c.code);
                return (
                  <button key={c.code} type="button" onClick={() => toggleCountry(c.code)}
                    className={`px-3 py-1.5 rounded-full border text-sm ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Roughly how many messages per month?</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {VOLUMES.map((v) => (
                <button key={v.v} type="button" onClick={() => setForm({ ...form, monthlyVolume: v.v })}
                  className={`p-3 rounded-md border text-sm text-left ${form.monthlyVolume === v.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>What will you text people about?</Label>
            <Textarea rows={3} value={form.useCase} onChange={(e) => setForm({ ...form, useCase: e.target.value })}
              placeholder="e.g. New product launches, restock alerts, and seasonal sale notifications for our customers who opted in at checkout." />
          </div>

          <div className="space-y-1.5">
            <Label>Sample message a subscriber would receive</Label>
            <Textarea rows={2} value={form.sampleMessage} onChange={(e) => setForm({ ...form, sampleMessage: e.target.value })}
              placeholder="Hi Sam! Our spring sale starts today — 20% off everything with code SPRING20. Reply STOP to opt out." />
          </div>

          <div className="space-y-1.5">
            <Label>How do subscribers opt in?</Label>
            <Textarea rows={3} value={form.optInDescription} onChange={(e) => setForm({ ...form, optInDescription: e.target.value })}
              placeholder="At checkout customers check a box that says 'Yes, send me SMS updates'. The box is unchecked by default." />
            <div className="flex items-center gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted">
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Upload sign-up form screenshot (optional)
                </span>
              </label>
              {form.optInScreenshotPath && <span className="text-xs text-success">✓ Screenshot attached</span>}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={!form.useCase || !form.sampleMessage || !form.optInDescription || form.targetCountries.length === 0}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-4 text-center">
          <Sparkles className="size-12 text-primary mx-auto" />
          <h3 className="text-xl font-bold">You're all set</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            We'll provision your sender number and submit the carrier registration in the background.
            You'll get an email when your SMS is ready — usually within 7–10 business days.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => runSetup.mutate()} disabled={runSetup.isPending} size="lg">
              {runSetup.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Set up my SMS
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "text-foreground" : "text-muted-foreground"}`}>
      <div className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold border ${done ? "bg-success text-success-foreground border-success" : active ? "border-primary text-primary" : "border-border"}`}>
        {done ? <CheckCircle2 className="size-4" /> : n}
      </div>
      <span className="text-sm font-medium hidden sm:inline">{label}</span>
    </div>
  );
}

function Field({ label, v, on, placeholder, type }: { label: string; v: string; on: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
