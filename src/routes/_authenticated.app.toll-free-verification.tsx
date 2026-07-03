import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check as CheckIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyTollfreeVerification,
  refreshTollfreeVerification,
  submitTollfreeVerification,
  getTollfreeFeeStatus,
  payTollfreeFee,
} from "@/lib/tollfree-verification.functions";
import { getTfnMarketplaceOffer, purchaseTfnFromMarketplace } from "@/lib/tfn-marketplace.functions";
import { uploadOptInProof } from "@/lib/opt-in-proof.functions";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { COUNTRIES, isoFromDial } from "@/lib/countries";

export const Route = createFileRoute("/_authenticated/app/toll-free-verification")({
  component: TollfreeVerificationPage,
});

const VOLUMES = [
  "10",
  "100",
  "1,000",
  "10,000",
  "100,000",
  "250,000",
  "500,000",
  "750,000",
  "1,000,000",
  "5,000,000+",
] as const;
const OPT_IN_TYPES = [
  { v: "WEB_FORM", l: "Web Form" },
  { v: "VERBAL", l: "Verbal" },
  { v: "PAPER_FORM", l: "Paper Form" },
  { v: "VIA_TEXT", l: "Via Text" },
  { v: "MOBILE_QR_CODE", l: "Mobile QR Code" },
] as const;
const BUSINESS_TYPES = [
  "Sole Proprietor",
  "Private company / LLC / Partnership",
  "Public company",
  "Non-profit",
  "Government",
] as const;

const REGISTRATION_AUTHORITIES = [
  { v: "EIN", l: "EIN — US employer ID" },
  { v: "CBN", l: "CBN — Canadian business number" },
  { v: "CRN", l: "CRN — Company registration number" },
  { v: "PROVINCIAL_NUMBER", l: "Provincial number — Canada" },
  { v: "VAT", l: "VAT — Value-added tax number" },
  { v: "BRN", l: "BRN — Business registration number" },
  { v: "OTHER", l: "Other" },
] as const;

const LEGACY_BUSINESS_TYPE_MAP: Record<string, (typeof BUSINESS_TYPES)[number]> = {
  "Sole Proprietorship": "Sole Proprietor",
  Partnership: "Private company / LLC / Partnership",
  "Limited Liability Corporation": "Private company / LLC / Partnership",
  "Co-operative": "Private company / LLC / Partnership",
  Corporation: "Private company / LLC / Partnership",
  PRIVATE_PROFIT: "Private company / LLC / Partnership",
  PUBLIC_PROFIT: "Public company",
  NON_PROFIT: "Non-profit",
  SOLE_PROPRIETOR: "Sole Proprietor",
  GOVERNMENT: "Government",
};
const CATEGORIES = [
  "ACCOUNT_NOTIFICATIONS",
  "CUSTOMER_CARE",
  "MARKETING",
  "TWO_FACTOR_AUTHENTICATION",
  "CHARITY_NONPROFIT",
  "DELIVERY_NOTIFICATIONS",
  "FRAUD_ALERT_MESSAGING",
  "EVENTS",
  "HIGHER_EDUCATION",
  "K12",
  "POLLING_AND_VOTING_NON_POLITICAL",
  "POLITICAL_ELECTION_CAMPAIGNS",
  "PUBLIC_SERVICE_ANNOUNCEMENT",
  "SECURITY_ALERT",
] as const;

const LEGACY_CATEGORY_MAP: Record<string, (typeof CATEGORIES)[number]> = {
  "2FA": "TWO_FACTOR_AUTHENTICATION",
  FRAUD_ALERTS: "FRAUD_ALERT_MESSAGING",
  GENERAL_MARKETING: "MARKETING",
  POLLING_AND_VOTING: "POLLING_AND_VOTING_NON_POLITICAL",
  SECURITY_ALERTS: "SECURITY_ALERT",
  GENERAL_SCHOOL_UPDATES: "K12",
  HEALTHCARE_ALERTS: "ACCOUNT_NOTIFICATIONS",
  APPOINTMENTS: "ACCOUNT_NOTIFICATIONS",
};

function normalizeCategories(values: unknown): string[] {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const normalized = raw
    .map((v) => String(v).trim().toUpperCase())
    .map((v) => LEGACY_CATEGORY_MAP[v] ?? v)
    .filter((v) => (CATEGORIES as readonly string[]).includes(v));
  return Array.from(new Set(normalized));
}

function normalizeBusinessTypeLabel(value: unknown) {
  const raw = String(value ?? "").trim();
  if (LEGACY_BUSINESS_TYPE_MAP[raw]) return LEGACY_BUSINESS_TYPE_MAP[raw];
  return (BUSINESS_TYPES as readonly string[]).includes(raw) ? raw : "";
}

function looksLikeRegisteredEntity(name: unknown) {
  return /\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORPORATION|LTD|LIMITED|LP|LLP|CO\.|COMPANY|NONPROFIT|NON-PROFIT)\b/i.test(
    String(name ?? ""),
  );
}

type Status = "submitted" | "in_review" | "verified" | "rejected";

function StatusBadge({ status }: { status: Status | null | undefined }) {
  if (!status)
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="size-3" />
        Not submitted
      </Badge>
    );
  if (status === "verified")
    return (
      <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-500 text-white">
        <CheckCircle2 className="size-3" />
        Approved by carrier
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="size-3" />
        Rejected
      </Badge>
    );
  if (status === "in_review")
    return (
      <Badge className="gap-1 bg-blue-500 hover:bg-blue-500 text-white">
        <Hourglass className="size-3" />
        In review
      </Badge>
    );
  return (
    <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
      <Clock className="size-3" />
      Pending review
    </Badge>
  );
}

function statusBlurb(status: Status | null | undefined) {
  switch (status) {
    case "verified":
      return "Your toll-free number is approved and ready to send to US carriers.";
    case "rejected":
      return "The carrier rejected this submission. Fix the issue below and click Resubmit.";
    case "in_review":
      return "The carrier is actively reviewing your submission. This usually takes 1–3 weeks.";
    case "submitted":
      return "Submitted to the carrier. They will move it into review shortly.";
    default:
      return "Fill the form below to request approval for a US toll-free number.";
  }
}

function friendlyRejectionDisplay(asset: any) {
  const raw = String(asset?.rejection_reason ?? "").toLowerCase();
  if (raw.includes("invalid sole proprietorship classification")) {
    return "This business was submitted as a sole proprietor, but carriers are treating it as a registered business. Choose Private company / LLC / Partnership, enter the registration details, and resubmit; the reserved toll-free number will be reused.";
  }
  if (raw.includes("usecasecategories")) {
    return "The selected use case category was not accepted by the carrier. Choose one of the allowed categories below and retry; the reserved toll-free number will be reused.";
  }
  if (raw.includes("opt") || raw.includes("consent")) {
    return "The carrier received and could open the opt-in proof, but the proof did not clearly match the submitted SMS use case. Resubmit with a screenshot or public form page that visibly shows the same business name, phone field, an optional/unchecked SMS opt-in checkbox, the marketing/message purpose, Msg & data rates may apply, Reply STOP to opt out, HELP for help, plus Privacy Policy and Terms links.";
  }
  return asset?.friendly_rejection_reason ?? asset?.rejection_reason ?? "No reason provided.";
}

function hasSubmissionStarted(asset: any) {
  return !!asset?.verification_sid;
}

function hasReservedTollfreeNumber(asset: any) {
  return !!asset && !asset.verification_sid && (!!asset.phone_number || !!asset.phone_sid);
}

function TollfreeVerificationPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMyTollfreeVerification);
  const submit = useServerFn(submitTollfreeVerification);
  const refresh = useServerFn(refreshTollfreeVerification);
  const feeStatusFn = useServerFn(getTollfreeFeeStatus);
  const payFeeFn = useServerFn(payTollfreeFee);

  const feeQuery = useQuery({
    queryKey: ["tollfree-fee-status"],
    queryFn: () => feeStatusFn(),
  });
  const payFeeMut = useMutation({
    mutationFn: () => payFeeFn(),
    onSuccess: () => {
      toast.success("Verification fee paid. You can now fill in the details.");
      qc.invalidateQueries({ queryKey: ["tollfree-fee-status"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Payment failed"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tollfree-verification"],
    queryFn: () => load(),
    // Live polling: keep refreshing while still reviewing.
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.asset?.verification_status as Status | null | undefined;
      if (s === "submitted" || s === "in_review") return 30_000;
      return false;
    },
    refetchIntervalInBackground: false,
  });

  const asset = data?.asset ?? null;
  // Guard: never trust a "verified"/"in_review"/"submitted" status that has no
  // our SMS provider verification SID behind it — without a SID the carrier never received
  // it. BUT "rejected" without a SID is a legitimate local-failure state
  // (e.g. the provider rejected the API call), and we must show its reason.
  const rawStatus = (asset?.verification_status as Status | "pending" | null) ?? null;
  const trustsCarrier = rawStatus === "submitted" || rawStatus === "in_review" || rawStatus === "verified";
  const status: Status | null =
    rawStatus === "pending" || (trustsCarrier && !asset?.verification_sid) ? null : rawStatus;
  const payload = (asset?.verification_payload as any) ?? null;
  // After submission the form is read-only. Only allow editing when nothing was
  // submitted yet, or when the carrier rejected and we need to resubmit.
  const submissionStarted = hasSubmissionStarted(asset);
  const hasReservedNumber = hasReservedTollfreeNumber(asset);
  const localSubmissionFailure = status === "rejected" && !asset?.verification_sid;
  const isLocked =
    status === "submitted" ||
    status === "in_review" ||
    status === "verified";

  const [form, setForm] = useState(() => defaultForm());
  const [step, setStep] = useState<1 | 2>(1);
  useEffect(() => {
    if (payload) {
      const normalizedCategories = normalizeCategories(payload.useCaseCategories);
      const normalizedBusinessType = normalizeBusinessTypeLabel(payload.businessType);
      const rejectedSoleProprietor = String(asset?.rejection_reason ?? "")
        .toLowerCase()
        .includes("invalid sole proprietorship classification");
      setForm({
        ...defaultForm(),
        ...payload,
        businessType:
          normalizedBusinessType === "Sole Proprietor" &&
          (looksLikeRegisteredEntity(payload.legalEntityName) || rejectedSoleProprietor)
            ? "Private company / LLC / Partnership"
            : normalizedBusinessType,
        businessRegistrationCountry: payload.businessRegistrationCountry || payload.businessCountry || "US",
        useCaseCategories: normalizedCategories.length ? normalizedCategories : defaultForm().useCaseCategories,
        agreeToTos: true,
      });
    }
  }, [payload, asset?.rejection_reason]);


  const submitMut = useMutation({
    mutationFn: (input: any) => submit({ data: input }),
    onSuccess: (res) => {
      toast.success(
        res.status === "verified"
          ? "Approved by the carrier."
          : res.status === "rejected"
            ? (res.friendlyRejectionReason ?? "Submission failed. You can retry now without buying another number.")
            : "Submitted. The carrier will review shortly.",
      );
      qc.invalidateQueries({ queryKey: ["tollfree-verification"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit"),
  });

  const refreshMut = useMutation({
    mutationFn: () => refresh({ data: undefined as any }),
    onSuccess: () => {
      toast.success("Status refreshed");
      qc.invalidateQueries({ queryKey: ["tollfree-verification"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  // Live carrier-side refresh: while the carrier is still reviewing, ask
  // the provider directly for the latest status every minute (belt-and-braces in
  // case the provider's webhook doesn't fire).
  useEffect(() => {
    if (status !== "submitted" && status !== "in_review") return;
    if (!asset?.verification_sid) return;
    const id = setInterval(() => {
      refresh({ data: undefined as any })
        .then(() => qc.invalidateQueries({ queryKey: ["tollfree-verification"] }))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [status, asset?.verification_sid, refresh, qc]);

  // Realtime: instantly reflect DB updates (driven by the the provider webhook)
  // for this user's sender_assets row.
  useEffect(() => {
    if (!asset?.id) return;
    const channel = supabase
      .channel(`sender-asset-${asset.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sender_assets", filter: `id=eq.${asset.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["tollfree-verification"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [asset?.id, qc]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit = useMemo(() => isValid(form), [form]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) {
      toast.error("This toll-free request has already been started, so another number will not be purchased.");
      return;
    }
    if (!canSubmit) {
      toast.error("Please fill in all required fields and accept the Terms.");
      return;
    }
    submitMut.mutate({ ...form, agreeToTos: true });
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            US toll-free verification
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            US carriers (AT&amp;T, T-Mobile, Verizon) block all messages from toll-free numbers until
            verified. Submit your business details here — we'll auto-purchase a toll-free number and
            send your details for verification.
          </p>
        </div>
        
      </div>

      <MarketplaceBuyCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Current status</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {hasReservedNumber
                ? localSubmissionFailure
                  ? "Submission did not return a verification ID, so this was not submitted to carrier review. Fix anything needed and retry below; no new number will be purchased."
                  : "A toll-free number is already reserved for this request, but the verification ID has not been returned yet. Continue below; no new number will be purchased."
                : statusBlurb(status)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {(asset?.verification_sid || asset?.phone_sid) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshMut.mutate()}
                disabled={refreshMut.isPending}
              >
                {refreshMut.isPending ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="size-4 mr-1" />
                )}
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        {asset && (
          <CardContent className="space-y-3">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div>
                <div className="text-muted-foreground text-xs">Toll-free number</div>
                <div className="font-mono">{asset.phone_number ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Verification ID</div>
                <div className="font-mono text-xs">{asset.verification_sid ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Last checked</div>
                <div className="text-xs">
                  {asset.last_synced_at
                    ? new Date(asset.last_synced_at as string).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>
            {status === "rejected" && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertCircle className="size-4" />
                  {localSubmissionFailure ? "Submission failed — retry available" : "Why it was rejected"}
                </div>
                <div className="mt-1 text-foreground">
                  {friendlyRejectionDisplay(asset)}
                </div>
                {localSubmissionFailure && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    This did not enter carrier review because there is no verification ID. Retry will reuse the reserved number.
                  </div>
                )}
                {asset.rejection_reason && asset.friendly_rejection_reason && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Carrier message: {asset.rejection_reason}
                  </div>
                )}
              </div>
            )}
            {status === "verified" && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm flex items-center gap-2">
                <BadgeCheck className="size-4 text-emerald-600" />
                Your toll-free number is approved. Campaigns to US recipients will now deliver.
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {asset?.verification_sid && <Timeline asset={asset} status={status} />}

      {isLocked && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Your submission is locked while the carrier reviews it. Only the carrier can approve or reject this — we cannot approve it manually. This page updates automatically.
        </div>
      )}

      {!feeQuery.isLoading && !feeQuery.data?.paid && (
        <Card className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="size-5 text-amber-600" />
              Pay the ${feeQuery.data?.fee ?? 5} verification fee to continue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A one-time ${feeQuery.data?.fee ?? 5} fee covers your toll-free phone number and carrier verification. You'll be able to fill out the verification form right after payment. Resubmissions after a rejection are free.
            </p>
            <div className="flex items-center justify-between rounded-md border bg-background p-3 text-sm">
              <span className="text-muted-foreground">Your credit balance</span>
              <span className="font-semibold tabular-nums">
                ${(feeQuery.data?.balance ?? 0).toFixed(2)}
              </span>
            </div>
            {(feeQuery.data?.balance ?? 0) < (feeQuery.data?.fee ?? 5) ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <p className="text-sm text-destructive flex-1">
                  Insufficient balance. Top up at least ${feeQuery.data?.fee ?? 5} to continue.
                </p>
                <Button asChild>
                  <Link to="/app/billing">Top up balance</Link>
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => payFeeMut.mutate()}
                disabled={payFeeMut.isPending}
                className="w-full sm:w-auto"
              >
                {payFeeMut.isPending ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : null}
                Pay ${feeQuery.data?.fee ?? 5} and continue
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {feeQuery.data?.paid && (
      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        <TollfreeStepper step={step} onGoTo={(s) => setStep(s)} canGoTo2={isBasicValid(form)} />
      <form onSubmit={handleSubmit} className="space-y-6">

        <fieldset disabled={isLocked} className={isLocked ? "opacity-70 pointer-events-none" : ""} aria-disabled={isLocked}>
        {step === 1 && (<>
        <Section title="Business information">
          <Two>
            <Field label="Legal entity name" required>
              <Input
                value={form.legalEntityName}
                onChange={(e) => update("legalEntityName", e.target.value)}
                placeholder="Xellvio LLC"
              />
            </Field>
            <Field label="Website URL" required>
              <Input
                value={form.websiteUrl}
                onChange={(e) => update("websiteUrl", e.target.value)}
                placeholder="https://yourcompany.com"
              />
            </Field>
          </Two>
          <Two>
            <Field label="First name" required>
              <Input
                value={form.contactFirstName}
                onChange={(e) => update("contactFirstName", e.target.value)}
              />
            </Field>
            <Field label="Last name" required>
              <Input
                value={form.contactLastName}
                onChange={(e) => update("contactLastName", e.target.value)}
              />
            </Field>
          </Two>
          <Two>
            <Field label="Email" required>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <Field label="Country" required>
                <Select
                  value={form.contactPhoneCountry}
                  onValueChange={(v) => {
                    update("contactPhoneCountry", v);
                    const iso = isoFromDial(v);
                    if (iso) {
                      if (!form.businessCountry) update("businessCountry", iso);
                      if (!form.businessRegistrationCountry)
                        update("businessRegistrationCountry", iso);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="+1" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={`${c.iso}-${c.dial}`} value={c.dial}>
                        {c.dial} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Phone number" required>
                <Input
                  value={form.contactPhone}
                  onChange={(e) => update("contactPhone", e.target.value)}
                  placeholder="5551234567"
                />
              </Field>
            </div>
          </Two>
          <Two>
            <Field label="Business type" required>
              <Select
                value={form.businessType}
                onValueChange={(v) => update("businessType", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a business type" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Business DBA (optional)">
              <Input
                value={form.businessDba ?? ""}
                onChange={(e) => update("businessDba", e.target.value)}
                placeholder="Doing Business As name"
              />
            </Field>
          </Two>
          {form.businessType && form.businessType !== "Sole Proprietor" && (
            <Three>
              <Field label="Business registration number" required>
                <Input
                  value={form.businessRegistrationNumber ?? ""}
                  onChange={(e) => update("businessRegistrationNumber", e.target.value)}
                  placeholder="e.g. EIN 12-3456789"
                />
              </Field>
              <Field label="Registration authority" required>
                <Select
                  value={form.businessRegistrationIdentifier ?? ""}
                  onValueChange={(v) => update("businessRegistrationIdentifier", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select authority" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTRATION_AUTHORITIES.map((authority) => (
                      <SelectItem key={authority.v} value={authority.v}>
                        {authority.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Registration country" required>
                <Select
                  value={form.businessRegistrationCountry ?? "US"}
                  onValueChange={(v) => update("businessRegistrationCountry", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.iso} value={c.iso}>
                        {c.iso} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Three>
          )}
        </Section>


        <Section title="Step 2 / 3 — Business location">
          <Two>
            <Field label="Country" required>
              <Select
                value={form.businessCountry}
                onValueChange={(v) => {
                  update("businessCountry", v);
                  if (!form.businessRegistrationCountry || form.businessRegistrationCountry === "US")
                    update("businessRegistrationCountry", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.iso} value={c.iso}>
                      {c.iso} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div />
          </Two>
          <Two>
            <Field label="Address line 1" required>
              <Input
                value={form.addressLine1}
                onChange={(e) => update("addressLine1", e.target.value)}
              />
            </Field>
            <Field label="Address line 2 (optional)">
              <Input
                value={form.addressLine2 ?? ""}
                onChange={(e) => update("addressLine2", e.target.value)}
              />
            </Field>
          </Two>
          <Three>
            <Field label="City" required>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </Field>
            <Field label="State" required>
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
            </Field>
            <Field label="Zip code" required>
              <Input value={form.zip} onChange={(e) => update("zip", e.target.value)} />
            </Field>
          </Three>
        </Section>

        <Section title="Step 3 / 3 — Messaging use case">
          <Two>
            <Field label="Estimated monthly volume" required>
              <Select
                value={form.monthlyVolume}
                onValueChange={(v) => update("monthlyVolume", v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOLUMES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Opt-in type" required>
              <Select
                value={form.optInType}
                onValueChange={(v) => update("optInType", v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPT_IN_TYPES.map((o) => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Two>
          <Two>
            <Field label="Use case category" required>
              <Select
                value={form.useCaseCategories[0] ?? "MARKETING"}
                onValueChange={(v) => update("useCaseCategories", [v] as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Proof of consent (URL or screenshot)"
              required
              hint="Required. Paste the public URL of your sign-up page, OR upload a screenshot showing the SMS opt-in checkbox / form."
            >
              <Input
                value={form.proofOfOptInUrl ?? ""}
                onChange={(e) => update("proofOfOptInUrl", e.target.value)}
                placeholder="https://yourcompany.com/optin"
              />
              <OptInProofUpload
                currentUrl={form.proofOfOptInUrl ?? ""}
                onUploaded={(url) => update("proofOfOptInUrl", url)}
              />
              <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                <Checkbox
                  checked={form.proofShowsRequiredConsent}
                  onCheckedChange={(v) => update("proofShowsRequiredConsent", v === true)}
                  className="mt-0.5"
                />
                <span>
                  I confirm this proof visibly shows the business name, phone field or SMS sign-up form,
                  an optional/unchecked SMS opt-in checkbox, the message purpose, Msg &amp; data rates may apply,
                  Reply STOP to opt out, HELP for help, and Privacy Policy / Terms links.
                </span>
              </label>
            </Field>
          </Two>
          <Two>
            <Field label="Use case description" required>
              <Textarea
                rows={4}
                value={form.useCaseDescription}
                onChange={(e) => update("useCaseDescription", e.target.value)}
                placeholder="Explain who you're texting, what they'll receive, and how they signed up."
              />
            </Field>
            <Field label="Sample message" required>
              <Textarea
                rows={4}
                value={form.sampleMessage}
                onChange={(e) => update("sampleMessage", e.target.value)}
                placeholder="Hi {first_name}, this is YourCo with a 20% off code: SAVE20. Reply STOP to opt out."
              />
            </Field>
          </Two>
          <Two>
            <Field label="E-mail for notifications" required>
              <Input
                type="email"
                value={form.notificationEmail}
                onChange={(e) => update("notificationEmail", e.target.value)}
              />
            </Field>
            <Field label="Additional information (optional)">
              <Textarea
                rows={3}
                value={form.additionalInformation ?? ""}
                onChange={(e) => update("additionalInformation", e.target.value)}
              />
            </Field>
          </Two>
          <Two>
            <Field label="Opt-in confirmation message (optional)">
              <Textarea
                rows={3}
                value={form.optInConfirmationMessage ?? ""}
                onChange={(e) => update("optInConfirmationMessage", e.target.value)}
              />
            </Field>
            <Field label="HELP message sample (optional)">
              <Textarea
                rows={3}
                value={form.helpMessageSample ?? ""}
                onChange={(e) => update("helpMessageSample", e.target.value)}
              />
            </Field>
          </Two>
          <Field label="Privacy policy URL (optional)">
            <Input
              value={form.privacyPolicyUrl ?? ""}
              onChange={(e) => update("privacyPolicyUrl", e.target.value)}
              placeholder="https://yourcompany.com/privacy"
            />
          </Field>
          <Field label="Terms & conditions URL (optional)">
            <Input
              value={form.termsUrl ?? ""}
              onChange={(e) => update("termsUrl", e.target.value)}
              placeholder="https://yourcompany.com/terms"
            />
          </Field>
          <Field label="Opt-in keywords (optional)">
            <Input
              value={form.optInKeywords ?? ""}
              onChange={(e) => update("optInKeywords", e.target.value)}
              placeholder="JOIN START YES"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.containsAgeGatedContent}
              onCheckedChange={(v) => update("containsAgeGatedContent", v === true)}
            />
            Contains age-gated content
          </label>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <label className="flex items-start gap-2">
              <Checkbox
                checked={form.agreeToTos}
                onCheckedChange={(v) => update("agreeToTos", v === true)}
              />
              <span>
                I agree to the carrier Terms of Service. I certify that the associated business
                profile is the originator of these messages and that I will participate in traceback
                efforts initiated by the Secure Telephony Identity Policy Administrator and the US
                Telecom Traceback Group.
              </span>
            </label>
          </div>
        </Section>
        </fieldset>

        {!isLocked && (
          <div className="flex flex-col items-end gap-2">
            <div className="text-xs text-muted-foreground rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
              A one-time <strong>$3.50</strong> fee will be deducted from your credit balance for the toll-free number &amp; carrier verification. Resubmissions after a rejection are free.
            </div>
            <Button type="submit" disabled={!canSubmit || submitMut.isPending} size="lg">
              {submitMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              {status === "rejected"
                ? "Resubmit for verification"
                : hasReservedNumber
                  ? "Continue verification with reserved number"
                  : "Send information for verification"}
            </Button>
          </div>
        )}
      </form>
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Loading your verification…
        </div>
      )}
    </div>
  );
}

function Timeline({
  asset,
  status,
}: {
  asset: any;
  status: Status | null;
}) {
  const submittedAt = asset.created_at as string | null;
  const lastAt = asset.last_synced_at as string | null;
  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleString() : "—";
  const reached = (key: Status) => {
    if (status === "verified") return true;
    if (status === "rejected") return key === "submitted" || key === "in_review" || key === "rejected";
    if (status === "in_review") return key === "submitted" || key === "in_review";
    if (status === "submitted") return key === "submitted";
    return false;
  };
  const stages: Array<{
    key: Status;
    label: string;
    desc: string;
    timeAt?: string | null;
    Icon: typeof Clock;
  }> = [
    {
      key: "submitted",
      label: "Submitted to carrier",
      desc: "Your details were sent for the toll-free verification queue.",
      timeAt: submittedAt,
      Icon: ShieldCheck,
    },
    {
      key: "in_review",
      label: "In carrier review",
      desc: "The carriers are reviewing your submission. This usually takes 1–3 weeks.",
      timeAt: status === "in_review" ? lastAt : null,
      Icon: Hourglass,
    },
    {
      key: status === "rejected" ? "rejected" : "verified",
      label: status === "rejected" ? "Rejected by carrier" : "Approved by carrier",
      desc:
        status === "rejected"
          ? asset.friendly_rejection_reason ?? asset.rejection_reason ?? "The carrier rejected this submission."
          : status === "verified"
            ? "Your toll-free number is approved. Campaigns to US recipients will now deliver."
            : "Waiting for the carrier's final decision.",
      timeAt: status === "verified" || status === "rejected" ? lastAt : null,
      Icon: status === "rejected" ? AlertCircle : CheckCircle2,
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verification progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l border-border ml-3 space-y-6">
          {stages.map((s) => {
            const done = reached(s.key);
            const isCurrent =
              (status === "submitted" && s.key === "submitted") ||
              (status === "in_review" && s.key === "in_review") ||
              (status === "verified" && s.key === "verified") ||
              (status === "rejected" && s.key === "rejected");
            const tone =
              s.key === "rejected" && done
                ? "bg-destructive text-destructive-foreground border-destructive"
                : done
                  ? s.key === "verified"
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border";
            return (
              <li key={s.key} className="ml-6">
                <span
                  className={`absolute -left-3 flex size-6 items-center justify-center rounded-full border ${tone}`}
                >
                  <s.Icon className="size-3.5" />
                </span>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="font-medium">
                    {s.label}
                    {isCurrent && status !== "verified" && status !== "rejected" && (
                      <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {s.timeAt ? fmt(s.timeAt) : done ? "" : "Pending"}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                {s.key === "rejected" && done && asset.rejection_reason && asset.friendly_rejection_reason && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Carrier message: {asset.rejection_reason}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}



function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid md:grid-cols-2 gap-4">{children}</div>;
}
function Three({ children }: { children: React.ReactNode }) {
  return <div className="grid md:grid-cols-3 gap-4">{children}</div>;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {required && <span className="text-destructive mr-0.5">•</span>}
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function defaultForm() {
  return {
    legalEntityName: "",
    businessDba: "",
    websiteUrl: "",
    businessType: "",
    businessRegistrationNumber: "",
    businessRegistrationIdentifier: "",
    businessRegistrationCountry: "US",
    contactFirstName: "",
    contactLastName: "",
    contactEmail: "",
    contactPhoneCountry: "+1",
    contactPhone: "",
    businessCountry: "US",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    monthlyVolume: "10,000" as (typeof VOLUMES)[number],
    optInType: "WEB_FORM" as (typeof OPT_IN_TYPES)[number]["v"],
    useCaseCategories: ["MARKETING"] as string[],
    proofOfOptInUrl: "",
    proofShowsRequiredConsent: false,
    useCaseDescription: "",
    sampleMessage: "",
    notificationEmail: "",
    additionalInformation: "",
    optInConfirmationMessage: "",
    helpMessageSample: "",
    privacyPolicyUrl: "",
    termsUrl: "",
    optInKeywords: "",
    containsAgeGatedContent: false,
    agreeToTos: false,
  };
}

function isValid(f: ReturnType<typeof defaultForm>) {
  return (
    f.legalEntityName.trim().length >= 2 &&
    /^https?:\/\//.test(f.websiteUrl) &&
    !!f.businessType &&
    f.contactFirstName.trim() &&
    f.contactLastName.trim() &&
    /^[^@]+@[^@]+\.[^@]+$/.test(f.contactEmail) &&
    /^\+\d{1,4}$/.test(f.contactPhoneCountry) &&
    f.contactPhone.replace(/\D/g, "").length >= 5 &&
    f.addressLine1.trim() &&
    f.city.trim() &&
    f.state.trim() &&
    f.zip.trim() &&
    (f.businessType === "Sole Proprietor" ||
      (!!f.businessRegistrationNumber.trim() &&
        !!f.businessRegistrationIdentifier.trim() &&
        /^[A-Z]{2}$/.test(f.businessRegistrationCountry.trim()))) &&
    f.useCaseCategories.length > 0 &&
    /^https:\/\//.test((f.proofOfOptInUrl ?? "").trim()) &&
    f.proofShowsRequiredConsent === true &&
    f.useCaseDescription.trim().length >= 40 &&
    f.sampleMessage.trim().length >= 20 &&
    /^[^@]+@[^@]+\.[^@]+$/.test(f.notificationEmail) &&
    f.agreeToTos === true
  );
}

function OptInProofUpload({
  currentUrl,
  onUploaded,
}: {
  currentUrl: string;
  onUploaded: (url: string) => void;
}) {
  const upload = useServerFn(uploadOptInProof);
  const [busy, setBusy] = useState(false);
  const isUploaded = /\/api\/public\/opt-in-proof\//.test(currentUrl);

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Max 5MB.");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // base64 encode
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const dataBase64 = btoa(binary);
      const res = await upload({
        data: {
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64,
        },
      });
      onUploaded(res.url);
      toast.success("Screenshot uploaded — carriers can now view your opt-in proof.");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-medium rounded-md border border-dashed px-3 py-2 cursor-pointer hover:bg-muted/50">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <span>📎</span>}
          {busy ? "Uploading…" : "Upload screenshot (PNG, JPG, PDF — max 5MB)"}
          <input
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {isUploaded && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline"
          >
            View uploaded file
          </a>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Tip: the screenshot must show the exact opt-in experience for the same
        messages described in your use case. Carriers reject proof that is only a
        generic contact form, or proof where the checkbox/disclosures do not visibly
        match the marketing or notification messages you are asking to send.
      </p>
    </div>
  );
}

function MarketplaceBuyCard() {
  const offerFn = useServerFn(getTfnMarketplaceOffer);
  const buyFn = useServerFn(purchaseTfnFromMarketplace);
  const qc = useQueryClient();
  const { data: offer, isLoading } = useQuery({
    queryKey: ["tfn-marketplace-offer"],
    queryFn: () => offerFn(),
    refetchInterval: 60_000,
  });

  const buy = useMutation({
    mutationFn: () => buyFn(),
    onSuccess: (r: any) => {
      toast.success(`Number purchased: ${r.phone_number}`);
      qc.invalidateQueries({ queryKey: ["tfn-marketplace-offer"] });
      qc.invalidateQueries({ queryKey: ["tollfree-verification"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !offer) return null;

  const available = offer.available_count > 0;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BadgeCheck className="size-5 text-primary" />
          Skip the wait — buy a pre-verified toll-free number
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Get an already-verified toll-free number from our marketplace and start
          sending immediately. No forms, no carrier review, no waiting.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-lg font-semibold">
            ₦{Number(offer.price_ngn).toLocaleString()}
          </div>
          <Badge variant={available ? "default" : "outline"}>
            {available ? `${offer.available_count} available` : "Sold out — check back soon"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!available || buy.isPending}
            onClick={() => buy.mutate()}
          >
            {buy.isPending ? (
              <><Loader2 className="size-4 mr-2 animate-spin" />Purchasing…</>
            ) : (
              "Buy a verified number now"
            )}
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Prefer verifying your own number? Continue below.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

