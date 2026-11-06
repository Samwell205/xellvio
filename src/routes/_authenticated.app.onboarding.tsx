import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import type { AddressParts } from "@/lib/address-autocomplete.functions";

const EMPTY_ADDR: AddressParts = { line1: "", line2: "", city: "", state: "", postcode: "", country: "" };
function composeAddress(a: AddressParts) {
  return [a.line1, a.line2, a.city, [a.state, a.postcode].filter((x) => x.trim()).join(" "), a.country]
    .map((x) => x.trim()).filter(Boolean).join(", ");
}
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Phone, ShieldCheck } from "lucide-react";
import { provisionSubaccount, searchNumbers, purchaseNumber } from "@/lib/tenant-twilio.functions";
import { getProvisioningStatus, saveBusinessProfile } from "@/lib/account.functions";
import { getGrowthGoal, saveGrowthGoal } from "@/lib/growth-tenant.functions";
import { ONBOARDING_GOALS, type OnboardingGoalKey } from "@/lib/growth/taxonomy";
import { isProfileComplete } from "@/lib/profile-requirements";
import { firstTouch, sessionId, track } from "@/lib/growth/track";

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
  phone: string;
  industry: string;
  team_size: string;
};

const empty: Form = {
  legal_business_name: "",
  business_address: "",
  business_reg_number: "",
  website_url: "",
  privacy_policy_url: "",
  terms_url: "",
  contact_email: "",
  phone: "",
  industry: "",
  team_size: "",
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
      (
        await supabase
          .from("accounts")
          .select(
            "id,email,full_name,company,phone,legal_business_name,business_address,business_reg_number,website_url,privacy_policy_url,terms_url,contact_email,onboarding_status,telnyx_phone_number,industry,team_size",
          )
          .maybeSingle()
      ).data,
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
      phone: account.data.phone ?? "",
      industry: (account.data as any).industry ?? "",
      team_size: (account.data as any).team_size ?? "",
    });
  }, [account.data]);

  const [addr, setAddr] = useState<AddressParts>(EMPTY_ADDR);
  useEffect(() => {
    const saved = account.data?.business_address;
    if (saved) setAddr((a) => (a.line1 || a.city ? a : { ...EMPTY_ADDR, line1: saved }));
  }, [account.data?.business_address]);
  const setPart = (k: keyof AddressParts) => (v: string) => setAddr((a) => ({ ...a, [k]: v }));

  const status = account.data?.onboarding_status ?? "signup";
  const a = account.data as any;
  // Same rule as the dashboard gate: show the form until every required detail is saved.
  const profileDone = isProfileComplete(a);
  const [editing, setEditing] = useState(false);
  const step: 1 | 2 = useMemo(() => (profileDone && !editing ? 2 : 1), [profileDone, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const missing = [["street address", addr.line1], ["city", addr.city], ["country", addr.country]].find(([, v]) => !v.trim());
      if (missing) throw new Error(`Please enter your ${missing[0]}`);
      await saveProfileFn({ data: { ...form, business_address: composeAddress(addr) } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["provisioning-status"] });
      qc.invalidateQueries({ queryKey: ["my-session"] });
      track({ event: "onboarding_step_completed", props: { step: "business_profile" } });
      setEditing(false);
      toast.success("Business profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (account.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-1 pb-16">
      <div className="grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Account setup
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-[1.1] tracking-tight">
            {step === 1 ? "Your business, on record." : "Get ready to send."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {step === 1
              ? "Phone networks check these details before your texts go out. It takes about two minutes."
              : "Your profile is saved. Set up the number your customers will see your messages come from."}
          </p>

          <ol className="mt-8 space-y-0">
            <StepBadge n={1} active={step === 1} done={profileDone} label="Business profile" hint="Who you are and how to reach you" />
            <StepBadge n={2} active={step === 2} done={status === "active"} label="Sending number" hint="The number your texts come from" last />
          </ol>

          <div className="mt-8 hidden border-t border-border pt-6 lg:block">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your details stay private. We only share what phone networks need to approve your messages.
            </p>
          </div>
        </aside>

        <main className="min-w-0 space-y-8">
          {step === 1 && (
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-6 py-5 sm:px-8">
                <h2 className="text-lg font-semibold">Business details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Use the details customers and phone networks will recognise.</p>
              </header>

              <div className="divide-y divide-border">
                <FormGroup title="Identity" text="The name shown on your account.">
                  <Field
                    label="Business name"
                    required
                    v={form.legal_business_name}
                    on={(v) => setForm({ ...form, legal_business_name: v })}
                    placeholder="Your registered business name"
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <PickField label="Industry" v={form.industry} on={(v) => setForm({ ...form, industry: v })}
                      options={["Agency / reseller","Automotive","Beauty, salon & spa","Construction","Education & training","Entertainment & events","Financial services","Fitness & wellness","Healthcare & medical","Home services / trades","Insurance","Legal services","Logistics & transportation","Manufacturing","Marketing & advertising","Media & publishing","Non-profit & charity","Professional services","Real estate","Religious organization","Restaurants & hospitality","Retail & ecommerce","Software & technology","Telecommunications","Travel & tourism","Other"]} />
                    <PickField label="Team size" required={false} v={form.team_size} on={(v) => setForm({ ...form, team_size: v })}
                      options={["Just me","2–10","11–50","51–200","200+"]} />
                  </div>
                </FormGroup>

                <FormGroup title="Location" text="Start typing and pick your address from the list.">
                  <div className="space-y-2">
                    <FieldLabel label="Street address" required />
                    <AddressAutocomplete
                      value={addr.line1}
                      onChange={setPart("line1")}
                      onPick={(p) => setAddr(p)}
                      placeholder="Start typing, e.g. 221 Baker Street"
                    />
                  </div>
                  <Field label="Apartment, suite, unit" v={addr.line2} on={setPart("line2")} placeholder="e.g. Suite 4B" />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="City" required v={addr.city} on={setPart("city")} />
                    <Field label="State / county / region" v={addr.state} on={setPart("state")} />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Postcode / ZIP" v={addr.postcode} on={setPart("postcode")} />
                    <Field label="Country" required v={addr.country} on={setPart("country")} />
                  </div>
                </FormGroup>

                <FormGroup title="Contact" text="Where customers and our team can reach you.">
                  <Field
                    label="Website"
                    required
                    v={form.website_url}
                    on={(v) => setForm({ ...form, website_url: v })}
                    placeholder="https://"
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Contact email"
                      required
                      v={form.contact_email}
                      on={(v) => setForm({ ...form, contact_email: v })}
                      type="email"
                    />
                    <Field
                      label="Business phone"
                      required
                      v={form.phone}
                      on={(v) => setForm({ ...form, phone: v })}
                      placeholder="+1 (212) 555-0142"
                    />
                  </div>
                </FormGroup>
              </div>

              <footer className="flex flex-col-reverse gap-3 border-t border-border bg-muted/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 rounded-b-2xl">
                {editing && profileDone && (
                  <Button variant="ghost" onClick={() => setEditing(false)}>Back</Button>
                )}
                <p className="text-xs text-muted-foreground">Fields marked <span className="text-primary">*</span> are needed to continue.</p>
                <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                  Save and continue
                </Button>
              </footer>
            </section>
          )}

          {step === 2 && (
            <>
              <SenderStep provisioning={provisioning.data} />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button size="lg" variant="outline" onClick={() => { setEditing(true); window.scrollTo({ top: 0 }); }}>
                  Back to business details
                </Button>
                <Button size="lg" onClick={() => navigate({ to: "/app" })}>Go to my dashboard</Button>
              </div>
            </>
          )}

          <GoalPicker />
        </main>
      </div>
    </div>
  );
}

function SenderStep({
  provisioning,
}: {
  provisioning:
    | { hasSubaccount: boolean; hasNumber: boolean; phoneNumber: string | null }
    | undefined;
}) {
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
      void r;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const searchMut = useMutation({
    mutationFn: () => search({ data: { country } }),
    onSuccess: (r) => {
      setNumbers(r);
      if (r.length === 0) toast.message("No numbers available for that country");
    },
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
  // Prepare the business's sending setup automatically behind the scenes.
  const startedRef = useRef(false);
  useEffect(() => {
    if (provisioning && !hasSub && !startedRef.current) {
      startedRef.current = true;
      provisionMut.mutate();
    }
  }, [provisioning, hasSub]);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border px-6 py-5 sm:px-8">
        <h2 className="text-lg font-semibold">Sending setup</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick the number your texts will come from.</p>
      </header>

      <div className="divide-y divide-border">
        <div className={`px-6 py-6 sm:px-8 ${!hasSub ? "opacity-60" : ""}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                <Phone className="size-4" />
              </span>
              <div>
                <h3 className="font-medium">Sending number</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasNumber ? (
                    <>Your texts come from <span className="font-mono text-foreground">{provisioning?.phoneNumber}</span></>
                  ) : !hasSub ? (
                    "Getting things ready…"
                  ) : (
                    "Choose a country and pick a number."
                  )}
                </p>
              </div>
            </div>
            {hasNumber && <Badge className="self-start">Active</Badge>}
          </div>

          {hasSub && !hasNumber && (
            <div className="mt-5 sm:pl-[52px]">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["US", "CA", "GB", "AU", "DE", "FR", "ES", "IT", "NL", "SE"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={() => searchMut.mutate()} disabled={searchMut.isPending}>
                  {searchMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                  Find numbers
                </Button>
              </div>
              {numbers.length > 0 && (
                <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {numbers.map((n) => (
                    <li key={n.phone_number} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <div className="font-mono">{n.phone_number}</div>
                        <div className="text-xs text-muted-foreground">{[n.locality, n.region].filter(Boolean).join(", ")}</div>
                      </div>
                      <Button size="sm" onClick={() => buyMut.mutate(n.phone_number)} disabled={buyMut.isPending}>
                        {buyMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                        Choose
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StepBadge({
  n,
  active,
  done,
  label,
  hint,
  last,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
  hint: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-6">
      {!last && <span className="absolute left-[13px] top-8 bottom-1 w-px bg-border" aria-hidden />}
      <span
        className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : active ? "bg-foreground text-background" : "border border-border bg-background text-muted-foreground"}`}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <div className={active || done ? "" : "opacity-60"}>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </li>
  );
}

function FormGroup({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="grid gap-5 px-6 py-7 sm:px-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Label className="text-sm font-medium">
      {label}
      {required ? <span className="ml-0.5 text-primary">*</span> : <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>}
    </Label>
  );
}

function Field({
  label,
  required,
  v,
  on,
  placeholder,
  type,
}: {
  label: string;
  required?: boolean;
  v: string;
  on: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} required={required} />
      <Input className="h-11" value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}


/**
 * Asks what the workspace wants to achieve, then points at the shortest path to
 * that outcome. The answer also records how they first found Xellvio, so the
 * growth dashboard can tell which channels bring in real customers.
 */
function GoalPicker() {
  const qc = useQueryClient();
  const loadGoal = useServerFn(getGrowthGoal);
  const saveGoal = useServerFn(saveGrowthGoal);

  const goal = useQuery({ queryKey: ["growth-goal"], queryFn: () => loadGoal() });

  const pick = useMutation({
    mutationFn: (key: OnboardingGoalKey) => {
      const t = firstTouch();
      return saveGoal({
        data: {
          goal: key,
          session_id: sessionId(),
          source: t?.source ?? null,
          medium: t?.medium ?? null,
          campaign: t?.campaign ?? null,
        },
      });
    },
    onSuccess: () => {
      track({ event: "onboarding_goal_selected" });
      qc.invalidateQueries({ queryKey: ["growth-goal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = goal.data?.goal ?? null;
  const match = ONBOARDING_GOALS.find((g) => g.key === selected) ?? null;

  return (
    <section className="rounded-2xl border border-dashed border-border px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-sm font-semibold">What would you like to do first?</h3>
        <span className="text-xs text-muted-foreground">Optional · change it any time</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {ONBOARDING_GOALS.map((g) => (
          <button
            key={g.key}
            type="button"
            disabled={pick.isPending}
            onClick={() => pick.mutate(g.key as OnboardingGoalKey)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-60 ${selected === g.key ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40 hover:bg-muted"}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      {match && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="font-medium">Suggested next: </span>
            <span className="text-muted-foreground">{match.recommend.join(" · ")}</span>
          </div>
          {match.href && (
            <Button asChild size="sm" variant="outline">
              <a href={match.href} onClick={() => track({ event: "onboarding_recommendation_clicked" })}>Start here</a>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function PickField({ label, v, on, options, required = true }: { label: string; v: string; on: (v: string) => void; options: string[]; required?: boolean }) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} required={required} />
      <Select value={v} onValueChange={on}>
        <SelectTrigger className="h-11"><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
