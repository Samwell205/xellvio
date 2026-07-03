import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTenDlcStatus, submitTenDlcRegistration } from "@/lib/tendlc.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle, Info, ChevronLeft, ChevronRight, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/setup-10dlc")({
  head: () => ({ meta: [{ title: "10DLC Registration — Xellvio" }] }),
  component: TenDlcPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

const STEPS = ["Brand", "Campaign", "Review"] as const;

function TenDlcPage() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getTenDlcStatus);
  const submit = useServerFn(submitTenDlcRegistration);
  const statusQ = useQuery({ queryKey: ["10dlc-status"], queryFn: () => getStatus(), refetchInterval: 60_000 });

  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState({
    legal_name: "", ein: "", brand_type: "private", vertical: "",
    website: "", address_line: "", city: "", state: "", postal_code: "", country: "US",
    contact_first_name: "", contact_last_name: "", contact_email: "", contact_phone: "",
  });
  const [camp, setCamp] = useState({
    use_case: "marketing", description: "",
    sample_message_1: "", sample_message_2: "",
    opt_in_flow: "", opt_in_confirmation_url: "",
    help_keywords: "HELP",
    stop_keywords: "STOP,UNSUBSCRIBE,CANCEL,END,QUIT",
  });
  const [submitting, setSubmitting] = useState(false);

  const reg = statusQ.data?.registration;
  const fee = statusQ.data?.setup_fee_usd ?? 50;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submit({ data: { brand: brand as any, campaign: camp as any } });
      toast.success("10DLC registration submitted");
      qc.invalidateQueries({ queryKey: ["10dlc-status"] });
    } catch (e: any) {
      toast.error(e.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (statusQ.isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  // Status view (if already submitted / verified / rejected)
  if (reg && ["submitted", "in_review", "verified", "rejected"].includes(reg.status)) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">10DLC Registration</h1>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            {reg.status === "verified" && <CheckCircle2 className="size-6 text-green-600" />}
            {reg.status === "rejected" && <XCircle className="size-6 text-destructive" />}
            {(reg.status === "submitted" || reg.status === "in_review") && <Clock className="size-6 text-amber-600" />}
            <div>
              <div className="font-semibold text-lg capitalize">{reg.status.replace("_", " ")}</div>
              <div className="text-sm text-muted-foreground">
                {reg.status === "verified" && "Your brand and campaign are approved. US local numbers can now send at 10DLC rates."}
                {(reg.status === "submitted" || reg.status === "in_review") && "Under review. Typical: 1–3 business days for brand, 2–7 days for campaign."}
                {reg.status === "rejected" && (reg.rejection_reason ?? "Registration rejected. Contact support to re-submit.")}
              </div>
            </div>
          </div>
          {reg.submitted_at && <div className="text-xs text-muted-foreground">Submitted {new Date(reg.submitted_at).toLocaleString()}</div>}
          {reg.approved_at && <div className="text-xs text-muted-foreground">Approved {new Date(reg.approved_at).toLocaleString()}</div>}
        </Card>
      </div>
    );
  }

  // Wizard
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Register for 10DLC</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Required to send marketing SMS from US local numbers at scale. Higher throughput + lower cost than toll-free.
        </p>
      </div>

      <Card className="p-3 bg-amber-50 border-amber-200 text-sm flex gap-2">
        <DollarSign className="size-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-amber-900">${fee} one-time setup fee</div>
          <div className="text-amber-800">Charged in credits when you submit. Covers brand + campaign registration. No monthly fee.</div>
        </div>
      </Card>

      <div className="flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <div key={s} className={`px-3 py-1 rounded-full ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-muted" : "bg-muted/40 text-muted-foreground"}`}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="p-6 space-y-4">
          <div className="font-semibold flex items-center gap-2">Brand information <Badge variant="outline">Required</Badge></div>
          <Grid>
            <Field label="Legal business name" value={brand.legal_name} onChange={(v) => setBrand({ ...brand, legal_name: v })} />
            <Field label="EIN (tax ID)" value={brand.ein} onChange={(v) => setBrand({ ...brand, ein: v })} />
            <Field label="Website" placeholder="https://…" value={brand.website} onChange={(v) => setBrand({ ...brand, website: v })} />
            <div>
              <Label>Brand type</Label>
              <Select value={brand.brand_type} onValueChange={(v) => setBrand({ ...brand, brand_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private company</SelectItem>
                  <SelectItem value="public">Public company</SelectItem>
                  <SelectItem value="non_profit">Non-profit</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Industry / vertical" placeholder="e.g. Retail, SaaS, Health" value={brand.vertical} onChange={(v) => setBrand({ ...brand, vertical: v })} />
            <Field label="Address" value={brand.address_line} onChange={(v) => setBrand({ ...brand, address_line: v })} />
            <Field label="City" value={brand.city} onChange={(v) => setBrand({ ...brand, city: v })} />
            <Field label="State" value={brand.state} onChange={(v) => setBrand({ ...brand, state: v })} />
            <Field label="ZIP / postal code" value={brand.postal_code} onChange={(v) => setBrand({ ...brand, postal_code: v })} />
            <Field label="Country" value={brand.country} onChange={(v) => setBrand({ ...brand, country: v.toUpperCase() })} />
            <Field label="Contact first name" value={brand.contact_first_name} onChange={(v) => setBrand({ ...brand, contact_first_name: v })} />
            <Field label="Contact last name" value={brand.contact_last_name} onChange={(v) => setBrand({ ...brand, contact_last_name: v })} />
            <Field label="Contact email" value={brand.contact_email} onChange={(v) => setBrand({ ...brand, contact_email: v })} />
            <Field label="Contact phone" placeholder="+1…" value={brand.contact_phone} onChange={(v) => setBrand({ ...brand, contact_phone: v })} />
          </Grid>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)}>Next <ChevronRight className="size-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <div className="font-semibold">Campaign details</div>
          <div>
            <Label>Use case</Label>
            <Select value={camp.use_case} onValueChange={(v) => setCamp({ ...camp, use_case: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="mixed">Mixed (marketing + notifications)</SelectItem>
                <SelectItem value="customer_care">Customer care</SelectItem>
                <SelectItem value="account_notification">Account notifications</SelectItem>
                <SelectItem value="low_volume">Low volume mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Campaign description (40+ chars)</Label>
            <Textarea rows={3} value={camp.description} onChange={(e) => setCamp({ ...camp, description: e.target.value })} placeholder="Describe the type of messages you will send, to whom, and how often." />
          </div>
          <div>
            <Label>Sample message #1</Label>
            <Textarea rows={2} value={camp.sample_message_1} onChange={(e) => setCamp({ ...camp, sample_message_1: e.target.value })} placeholder="e.g. Hi {name}, 20% off ends tonight — {link}. Reply STOP to opt out." />
          </div>
          <div>
            <Label>Sample message #2</Label>
            <Textarea rows={2} value={camp.sample_message_2} onChange={(e) => setCamp({ ...camp, sample_message_2: e.target.value })} />
          </div>
          <div>
            <Label>Opt-in flow description</Label>
            <Textarea rows={3} value={camp.opt_in_flow} onChange={(e) => setCamp({ ...camp, opt_in_flow: e.target.value })} placeholder="e.g. Users check a box at checkout confirming they consent to receive SMS. They see the terms and can opt out at any time." />
          </div>
          <Field label="Opt-in confirmation URL" placeholder="https://…" value={camp.opt_in_confirmation_url} onChange={(v) => setCamp({ ...camp, opt_in_confirmation_url: v })} />
          <Grid>
            <Field label="HELP keywords" value={camp.help_keywords} onChange={(v) => setCamp({ ...camp, help_keywords: v })} />
            <Field label="STOP keywords" value={camp.stop_keywords} onChange={(v) => setCamp({ ...camp, stop_keywords: v })} />
          </Grid>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="size-4 mr-1" />Back</Button>
            <Button onClick={() => setStep(2)}>Next <ChevronRight className="size-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <div className="font-semibold flex items-center gap-2"><Info className="size-4" />Review + submit</div>
          <div className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Brand:</span> {brand.legal_name} · {brand.brand_type} · EIN {brand.ein}</div>
            <div><span className="text-muted-foreground">Contact:</span> {brand.contact_first_name} {brand.contact_last_name} · {brand.contact_email}</div>
            <div><span className="text-muted-foreground">Campaign use case:</span> {camp.use_case}</div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30 text-sm">
            <div className="font-medium">One-time fee: ${fee}</div>
            <div className="text-muted-foreground text-xs mt-1">
              Charged in credits on submit. Refunded if submission fails. Review typically completes in 2–7 business days.
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="size-4 mr-1" />Back</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Submitting…" : `Submit + charge $${fee}`}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
