import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Phone, ShieldCheck } from "lucide-react";
import { provisionSubaccount, searchNumbers, purchaseNumber } from "@/lib/tenant-twilio.functions";
import { getProvisioningStatus, saveBusinessProfile } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/app/onboarding")({
  head: () => ({ meta: [{ title: "Set up your business — Xellvio" }] }),
  component: OnboardingPage,
});

type Form = {
  legal_business_name: string;
  business_address: string;
  business_reg_number: string;
  website_url: string;
  privacy_policy_url: string;
  terms_url: string;
  contact_email: string;
};

const empty: Form = {
  legal_business_name: "",
  business_address: "",
  business_reg_number: "",
  website_url: "",
  privacy_policy_url: "",
  terms_url: "",
  contact_email: "",
};

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(empty);

  const provisioningFn = useServerFn(getProvisioningStatus);
  const saveProfileFn = useServerFn(saveBusinessProfile);

  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () =>
      (await supabase
        .from("accounts")
        .select(
          "id,email,full_name,company,phone,legal_business_name,business_address,business_reg_number,website_url,privacy_policy_url,terms_url,contact_email,onboarding_status,subaccount_phone_number"
        )
        .maybeSingle()).data,
  });

  const provisioning = useQuery({
    queryKey: ["provisioning-status"],
    queryFn: () => provisioningFn(),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!account.data) return;
    setForm({
      legal_business_name: account.data.legal_business_name ?? "",
      business_address: account.data.business_address ?? "",
      business_reg_number: account.data.business_reg_number ?? "",
      website_url: account.data.website_url ?? "",
      privacy_policy_url: account.data.privacy_policy_url ?? "",
      terms_url: account.data.terms_url ?? "",
      contact_email: account.data.contact_email ?? account.data.email ?? "",
    });
  }, [account.data]);

  const status = account.data?.onboarding_status ?? "signup";
  const step: 1 | 2 = useMemo(() => (status === "signup" ? 1 : 2), [status]);

  const save = useMutation({
    mutationFn: async () => {
      await saveProfileFn({ data: form });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["provisioning-status"] });
      toast.success("Business profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (account.isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Set up your business</h1>
        <p className="text-sm text-muted-foreground">
          We need a few details to provision your sending account. This information is required by carriers for SMS compliance.
        </p>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <StepBadge n={1} active={step === 1} done={status !== "signup"} label="Business profile" />
        <div className="h-px flex-1 bg-border" />
        <StepBadge n={2} active={step === 2} done={status === "active"} label="Sender provisioning" />
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Business details</h3>
          <Field label="Legal business name *" v={form.legal_business_name} on={(v) => setForm({ ...form, legal_business_name: v })} />
          <div className="space-y-1.5">
            <Label>Business address *</Label>
            <Textarea value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} rows={3} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Business registration # (EIN / BRN) *" v={form.business_reg_number} on={(v) => setForm({ ...form, business_reg_number: v })} />
            <Field label="Website URL *" v={form.website_url} on={(v) => setForm({ ...form, website_url: v })} placeholder="https://" />
            <Field label="Privacy policy URL" v={form.privacy_policy_url} on={(v) => setForm({ ...form, privacy_policy_url: v })} placeholder="https://" />
            <Field label="Terms of service URL" v={form.terms_url} on={(v) => setForm({ ...form, terms_url: v })} placeholder="https://" />
            <Field label="Contact email *" v={form.contact_email} on={(v) => setForm({ ...form, contact_email: v })} type="email" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate({ to: "/app" })}>Save for later</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Save and continue
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && <SenderStep provisioning={provisioning.data} />}
    </div>
  );
}

function SenderStep({ provisioning }: { provisioning: { hasSubaccount: boolean; hasNumber: boolean; phoneNumber: string | null } | undefined }) {
  const qc = useQueryClient();
  const provision = useServerFn(provisionSubaccount);
  const search = useServerFn(searchNumbers);
  const purchase = useServerFn(purchaseNumber);

  const [country, setCountry] = useState("US");
  const [numbers, setNumbers] = useState<any[]>([]);

  const provisionMut = useMutation({
    mutationFn: () => provision(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["provisioning-status"] });
      toast.success(r.already ? "Subaccount already provisioned" : "SMS subaccount created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const searchMut = useMutation({
    mutationFn: () => search({ data: { country } }),
    onSuccess: (r) => { setNumbers(r); if (r.length === 0) toast.message("No numbers available for that country"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const buyMut = useMutation({
    mutationFn: (phoneNumber: string) => purchase({ data: { phoneNumber } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["provisioning-status"] });
      toast.success("Number purchased — your account is live!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasSub = !!provisioning?.hasSubaccount;
  const hasNumber = !!provisioning?.hasNumber;

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="size-4" /> SMS subaccount</h3>
          {hasSub && <Badge variant="default">Provisioned</Badge>}
        </div>
        {hasSub ? (
          <p className="text-sm text-muted-foreground">Your dedicated SMS subaccount is active. Credentials are encrypted at rest and only available to server functions.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              We'll create a dedicated SMS subaccount under your business. Your subaccount auth token is encrypted at rest and never exposed to the browser.
            </p>
            <Button onClick={() => provisionMut.mutate()} disabled={provisionMut.isPending}>
              {provisionMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Create subaccount
            </Button>
          </>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Phone className="size-4" /> Sender phone number</h3>
          {hasNumber && <Badge variant="default">Active</Badge>}
        </div>
        {hasNumber ? (
          <p className="text-sm">
            Your sender: <span className="font-mono">{provisioning?.phoneNumber}</span>
          </p>
        ) : !hasSub ? (
          <p className="text-sm text-muted-foreground">Provision your subaccount first.</p>
        ) : (
          <>
            <div className="flex gap-2 items-end">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["US","CA","GB","AU","DE","FR","ES","IT","NL","SE"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => searchMut.mutate()} disabled={searchMut.isPending}>
                {searchMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                Search available numbers
              </Button>
            </div>
            {numbers.length > 0 && (
              <div className="border rounded-md divide-y">
                {numbers.map((n) => (
                  <div key={n.phone_number} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-mono">{n.phone_number}</div>
                      <div className="text-xs text-muted-foreground">{[n.locality, n.region].filter(Boolean).join(", ")}</div>
                    </div>
                    <Button size="sm" onClick={() => buyMut.mutate(n.phone_number)} disabled={buyMut.isPending}>
                      {buyMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                      Purchase
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function StepBadge({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "text-foreground" : "text-muted-foreground"}`}>
      <div className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold border ${done ? "bg-success text-success-foreground border-success" : active ? "border-primary text-primary" : "border-border"}`}>
        {done ? <CheckCircle2 className="size-4" /> : n}
      </div>
      <span className="text-sm font-medium">{label}</span>
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
