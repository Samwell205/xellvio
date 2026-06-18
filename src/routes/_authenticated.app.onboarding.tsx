import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/onboarding")({
  head: () => ({ meta: [{ title: "Set up your business — Samwell Global SMS" }] }),
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
  const [step, setStep] = useState<1 | 2>(1);

  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () => (await supabase.from("accounts").select("*").maybeSingle()).data,
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

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const required: (keyof Form)[] = ["legal_business_name", "business_address", "business_reg_number", "website_url", "contact_email"];
      for (const k of required) {
        if (!form[k].trim()) throw new Error(`${k.replace(/_/g, " ")} is required`);
      }
      const { error } = await supabase
        .from("accounts")
        .update({ ...form, onboarding_status: "profile_complete" })
        .eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      toast.success("Business profile saved");
      navigate({ to: "/app" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (account.isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin" /></div>;
  }

  const status = account.data?.onboarding_status ?? "signup";

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

      {step === 2 && (
        <Card className="p-6 space-y-3">
          <h3 className="font-semibold">Sender provisioning</h3>
          <p className="text-sm text-muted-foreground">
            Once your profile is approved, we'll provision a dedicated Twilio subaccount and sender number for you. This step is set up in the next release.
          </p>
        </Card>
      )}
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
