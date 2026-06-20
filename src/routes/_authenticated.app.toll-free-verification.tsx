import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyTollfreeVerification,
  refreshTollfreeVerification,
  submitTollfreeVerification,
} from "@/lib/tollfree-verification.functions";
import { supabase } from "@/integrations/supabase/client";
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
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Corporation",
  "Co-operative",
  "Non-profit Corporation",
  "Corporation",
] as const;
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

  const { data, isLoading } = useQuery({
    queryKey: ["tollfree-verification"],
    queryFn: () => load(),
    // Live polling: keep refreshing while Twilio is still reviewing.
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.asset?.verification_status as Status | null | undefined;
      if (s === "submitted" || s === "in_review") return 30_000;
      return false;
    },
    refetchIntervalInBackground: false,
  });

  const asset = data?.asset ?? null;
  // Guard: never trust a "verified"/"in_review"/"submitted" status that has no
  // Twilio verification SID behind it — without a SID the carrier never received
  // it. BUT "rejected" without a SID is a legitimate local-failure state
  // (e.g. Twilio rejected the API call), and we must show its reason.
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
  useEffect(() => {
    if (payload) {
      const normalizedCategories = normalizeCategories(payload.useCaseCategories);
      setForm({
        ...defaultForm(),
        ...payload,
        useCaseCategories: normalizedCategories.length ? normalizedCategories : defaultForm().useCaseCategories,
        agreeToTos: true,
      });
    }
  }, [payload]);


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
  // Twilio directly for the latest status every minute (belt-and-braces in
  // case Twilio's webhook doesn't fire).
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

  // Realtime: instantly reflect DB updates (driven by the Twilio webhook)
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Current status</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {hasReservedNumber
                ? localSubmissionFailure
                  ? "Twilio did not return a verification ID, so this was not submitted to carrier review. Fix anything needed and retry below; no new number will be purchased."
                  : "A toll-free number is already reserved for this request, but Twilio has not returned a verification ID yet. Continue below; no new number will be purchased."
                : statusBlurb(status)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {asset?.verification_sid && (
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
                  {asset.friendly_rejection_reason ?? asset.rejection_reason ?? "No reason provided."}
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
          Your submission is locked while the carrier reviews it. Only Twilio can approve or reject this — we cannot approve it manually. This page updates automatically.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset disabled={isLocked} className={isLocked ? "opacity-70 pointer-events-none" : ""} aria-disabled={isLocked}>
        <Section title="Step 1 / 3 — Business and contact information">
          <Two>
            <Field label="Legal entity name" required>
              <Input
                value={form.legalEntityName}
                onChange={(e) => update("legalEntityName", e.target.value)}
                placeholder="Samwell Reach Global LLC"
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
                <Input
                  value={form.contactPhoneCountry}
                  onChange={(e) => update("contactPhoneCountry", e.target.value)}
                  placeholder="+1"
                />
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
        </Section>

        <Section title="Step 2 / 3 — Business location">
          <Two>
            <Field label="Country" required>
              <Input
                value={form.businessCountry}
                onChange={(e) => update("businessCountry", e.target.value.toUpperCase())}
                maxLength={2}
              />
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
              label="Proof of consent URL"
              hint="Public URL to the page or screenshot where subscribers opt in. Required for non-verbal opt-in."
            >
              <Input
                value={form.proofOfOptInUrl ?? ""}
                onChange={(e) => update("proofOfOptInUrl", e.target.value)}
                placeholder="https://yourcompany.com/optin"
              />
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
          <div className="flex items-center justify-end gap-3">
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
      desc: "Your details were sent to Twilio for the toll-free verification queue.",
      timeAt: submittedAt,
      Icon: ShieldCheck,
    },
    {
      key: "in_review",
      label: "In carrier review",
      desc: "Twilio and the US carriers are reviewing your submission. This usually takes 1–3 weeks.",
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
    f.useCaseCategories.length > 0 &&
    f.useCaseDescription.trim().length >= 40 &&
    f.sampleMessage.trim().length >= 20 &&
    /^[^@]+@[^@]+\.[^@]+$/.test(f.notificationEmail) &&
    f.agreeToTos === true
  );
}
