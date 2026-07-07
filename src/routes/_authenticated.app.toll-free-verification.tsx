import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { TollfreeWizard, type WizardForm } from "@/components/tollfree-wizard/TollfreeWizard";

export const Route = createFileRoute("/_authenticated/app/toll-free-verification")({
  component: TollfreeVerificationPage,
});

type Status = "submitted" | "in_review" | "verified" | "rejected";

const BUSINESS_TYPE_MAP: Record<string, string> = {
  "Sole Proprietorship": "Sole Proprietor",
  Partnership: "Private company / LLC / Partnership",
  "Limited Liability Corporation": "Private company / LLC / Partnership",
  Corporation: "Private company / LLC / Partnership",
  "Co-operative": "Private company / LLC / Partnership",
  PRIVATE_PROFIT: "Private company / LLC / Partnership",
  PUBLIC_PROFIT: "Public company",
  NON_PROFIT: "Non-profit",
  SOLE_PROPRIETOR: "Sole Proprietor",
  GOVERNMENT: "Government",
};

function normalizePayload(payload: any): Partial<WizardForm> {
  if (!payload) return {};
  const bt = BUSINESS_TYPE_MAP[String(payload.businessType ?? "")] ?? payload.businessType ?? "";
  return { ...payload, businessType: bt };
}

// Best-effort parse of a single-line address like "651 N Broad Street, Middletown, DE 19709, US"
function parseAddress(s: string | null | undefined): { addressLine1: string; city: string; state: string; zip: string; businessCountry: string } {
  const empty = { addressLine1: "", city: "", state: "", zip: "", businessCountry: "" };
  if (!s) return empty;
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return { ...empty, addressLine1: s.trim() };
  const country = parts.length >= 4 ? parts[parts.length - 1] : "";
  const stateZip = parts.length >= 3 ? parts[parts.length - (country ? 2 : 1)] : "";
  const city = parts.length >= 3 ? parts[parts.length - (country ? 3 : 2)] : parts[1];
  const line1 = parts.slice(0, parts.length - (country ? 3 : 2)).join(", ") || parts[0];
  // "DE 19709" or "London SW1A 1AA"
  const m = stateZip.match(/^(.*?)\s+([A-Za-z0-9 -]{3,10})$/);
  const state = m ? m[1].trim() : stateZip;
  const zip = m ? m[2].trim() : "";
  return {
    addressLine1: line1,
    city,
    state,
    zip,
    businessCountry: /^[A-Z]{2}$/.test(country) ? country.toUpperCase() : "",
  };
}

function accountAutofillToForm(a: any | null | undefined): Partial<WizardForm> {
  if (!a) return {};
  const addr = parseAddress(a.business_address);
  const fullName = String(a.full_name ?? "").trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(" ");
  const phone = String(a.phone ?? "");
  const phoneMatch = phone.match(/^(\+\d{1,4})(.*)$/);
  return {
    legalEntityName: a.legal_business_name ?? "",
    websiteUrl: a.website_url ?? "",
    contactEmail: a.contact_email ?? "",
    contactFirstName: firstName ?? "",
    contactLastName: lastName ?? "",
    contactPhoneCountry: phoneMatch?.[1] ?? "+1",
    contactPhone: (phoneMatch?.[2] ?? phone).replace(/\D/g, ""),
    businessCountry: addr.businessCountry || "US",
    addressLine1: addr.addressLine1,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    useCaseDescription: a.use_case_description ?? "",
    sampleMessage: a.sample_message ?? "",
    privacyPolicyUrl: a.privacy_policy_url ?? "",
    termsUrl: a.terms_url ?? "",
    monthlyVolume: a.monthly_volume_estimate ? String(a.monthly_volume_estimate) : "10,000",
    notificationEmail: a.contact_email ?? "",
  };
}

function StatusBadge({ status }: { status: Status | null | undefined }) {
  if (!status) return <Badge variant="outline" className="gap-1"><Clock className="size-3" />Not submitted</Badge>;
  if (status === "verified") return <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-500 text-white"><CheckCircle2 className="size-3" />Approved by carrier</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><X className="size-3" />Rejected</Badge>;
  if (status === "in_review") return <Badge className="gap-1 bg-blue-500 hover:bg-blue-500 text-white"><Hourglass className="size-3" />In review</Badge>;
  return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white"><Clock className="size-3" />Pending review</Badge>;
}

function statusBlurb(status: Status | null | undefined) {
  switch (status) {
    case "verified": return "Your toll-free number is approved and ready to send to US carriers.";
    case "rejected": return "The carrier rejected this submission. Fix the issue below and click Resubmit.";
    case "in_review": return "The carrier is actively reviewing your submission. This usually takes 1–3 weeks.";
    case "submitted": return "Submitted to the carrier. They will move it into review shortly.";
    default: return "Fill in the wizard below to request approval for a US toll-free number.";
  }
}

function TollfreeVerificationPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMyTollfreeVerification);
  const submit = useServerFn(submitTollfreeVerification);
  const refresh = useServerFn(refreshTollfreeVerification);
  const feeStatusFn = useServerFn(getTollfreeFeeStatus);

  const feeQuery = useQuery({ queryKey: ["tollfree-fee-status"], queryFn: () => feeStatusFn() });

  const { data, isLoading } = useQuery({
    queryKey: ["tollfree-verification"],
    queryFn: () => load(),
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.asset?.verification_status as Status | null | undefined;
      if (s === "submitted" || s === "in_review") return 15_000;
      return false;
    },
    refetchIntervalInBackground: false,
  });

  const asset = data?.asset ?? null;
  const rawStatus = (asset?.verification_status as Status | "pending" | null) ?? null;
  const trustsCarrier = rawStatus === "submitted" || rawStatus === "in_review" || rawStatus === "verified";
  const status: Status | null =
    rawStatus === "pending" || (trustsCarrier && !asset?.telnyx_verification_id) ? null : rawStatus;
  const payload = (asset?.verification_payload as any) ?? null;
  const submissionStarted = !!asset?.telnyx_verification_id;
  const hasReservedNumber = !!asset && !asset.telnyx_verification_id && (!!asset.phone_number || !!asset?.telnyx_phone_number_id);
  const localSubmissionFailure = status === "rejected" && !asset?.telnyx_verification_id;
  const isLocked = status === "submitted" || status === "in_review" || status === "verified";

  const accountAutofill = useQuery({
    queryKey: ["tollfree-autofill-account"],
    queryFn: async () =>
      (await supabase
        .from("accounts")
        .select("legal_business_name,business_address,website_url,contact_email,full_name,phone,use_case_description,sample_message,privacy_policy_url,terms_url,monthly_volume_estimate")
        .maybeSingle()).data,
  });
  const initialForm = useMemo(
    () => ({ ...accountAutofillToForm(accountAutofill.data), ...normalizePayload(payload) }),
    [payload, accountAutofill.data],
  );

  const submitMut = useMutation({
    mutationFn: (input: any) => submit({ data: input }),
    onSuccess: (res) => {
      toast.success(
        res.status === "verified" ? "Approved by the carrier." :
        res.status === "rejected" ? (res.friendlyRejectionReason ?? "Submission failed. You can retry now without buying another number.") :
        "Submitted. The carrier will review shortly.",
      );
      qc.invalidateQueries({ queryKey: ["tollfree-verification"] });
      qc.invalidateQueries({ queryKey: ["tollfree-fee-status"] });
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

  useEffect(() => {
    if (status !== "submitted" && status !== "in_review") return;
    if (!asset?.telnyx_verification_id) return;
    const id = setInterval(() => {
      refresh({ data: undefined as any })
        .then(() => qc.invalidateQueries({ queryKey: ["tollfree-verification"] }))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [status, asset?.telnyx_verification_id, refresh, qc]);

  useEffect(() => {
    if (!asset?.id) return;
    const channel = supabase
      .channel(`sender-asset-${asset.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "sender_assets", filter: `id=eq.${asset.id}` },
        () => qc.invalidateQueries({ queryKey: ["tollfree-verification"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [asset?.id, qc]);

  const feePaid = !!feeQuery.data?.paid;

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" />
          Toll Free Verification Request
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Complete the carrier-style request below. We reserve the toll-free number during submission,
          charge the one-time ${feeQuery.data?.fee ?? 5} setup fee from credits, and send it for review.
        </p>
      </div>

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
            {(asset?.telnyx_verification_id || asset?.telnyx_phone_number_id) && (
              <Button variant="outline" size="sm" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>
                {refreshMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
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
                <div className="font-mono text-xs">{asset.telnyx_verification_id ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Last checked</div>
                <div className="text-xs">
                  {asset.last_synced_at ? new Date(asset.last_synced_at as string).toLocaleString() : "—"}
                </div>
              </div>
            </div>
            {(asset.friendly_rejection_reason || asset.rejection_reason) && status !== "verified" && (
              <div className={`rounded-md border p-3 text-sm ${status === "rejected" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
                <div className={`flex items-center gap-2 font-medium ${status === "rejected" ? "text-destructive" : "text-amber-600"}`}>
                  <AlertCircle className="size-4" />
                  {status === "rejected"
                    ? (localSubmissionFailure ? "Submission failed — retry available" : "Why it was rejected")
                    : "Carrier is requesting a change"}
                </div>
                <div className="mt-1 text-foreground">
                  {asset.friendly_rejection_reason ?? asset.rejection_reason}
                </div>
                {status !== "rejected" && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Update the affected fields below and click <strong>Resubmit</strong>. The carrier picks up the change automatically.
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

      {isLocked && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Your submission is locked while the carrier reviews it. Only the carrier can approve or reject this — we cannot approve it manually. This page updates automatically.
        </div>
      )}

      {!feePaid && !submissionStarted ? (
        <PayFeeGate
          fee={feeQuery.data?.fee ?? 5}
          balance={feeQuery.data?.balance ?? 0}
        />
      ) : (
        <TollfreeWizard
          key={submissionStarted ? "locked" : "editable"}
          initial={initialForm}
          disabled={isLocked}
          submitting={submitMut.isPending}
          reservedNumber={asset?.phone_number ?? null}
          verificationStatus={status ?? rawStatus ?? null}
          feeAmount={feeQuery.data?.fee ?? 5}
          creditBalance={feeQuery.data?.balance ?? 0}
          feePaid={feePaid}
          submitLabel={
            status === "rejected"
              ? "Resubmit for verification"
              : hasReservedNumber
                ? "Continue verification with reserved number"
                : "Submit registration"
          }
          onSubmit={async (form) => { await submitMut.mutateAsync({ ...form, agreeToTos: true }); }}
          helperBanner={
            !isLocked ? (
              <div className="rounded-md border bg-emerald-500/10 border-emerald-500/40 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                <strong>${feeQuery.data?.fee ?? 5} setup fee paid.</strong> You can submit and resubmit this verification as many times as needed at no extra cost.
              </div>
            ) : null
          }
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="size-5 text-primary" />
            Why the carrier portal would not let you buy it
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Telnyx blocks US toll-free orders on accounts that use a freemail address or have not reached the required account level. That is why the direct portal order failed.
          </p>
          <p>
            Your tenants should not buy inside Telnyx. In Xellvio they submit this wizard and the platform handles number assignment plus carrier verification. The ${feeQuery.data?.fee ?? 5} setup fee is charged from credits once, before registration starts.
          </p>
        </CardContent>
      </Card>

      <MarketplaceBuyCard />

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Loading your verification…
        </div>
      )}
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Price</div>
            <div className="font-semibold">${Number(offer.price_usd ?? 0).toFixed(2)}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Available</div>
            <div className="font-semibold">{offer.available_count}</div>
          </div>
          <Button disabled={!available || buy.isPending} onClick={() => buy.mutate()}>
            {buy.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            {available ? "Buy pre-verified number" : "Sold out"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PayFeeGate({ fee, balance }: { fee: number; balance: number }) {
  const qc = useQueryClient();
  const payFn = useServerFn(payTollfreeFee);
  const pay = useMutation({
    mutationFn: () => payFn(),
    onSuccess: () => {
      toast.success(`$${fee} setup fee paid. You can now start your registration.`);
      qc.invalidateQueries({ queryKey: ["tollfree-fee-status"] });
      qc.invalidateQueries({ queryKey: ["tollfree-verification"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Payment failed"),
  });
  const insufficient = balance < fee;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          Pay the ${fee} one-time setup fee to start
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Toll-free verification requires a one-time <strong>${fee}</strong> setup fee. It covers the toll-free number rental and carrier verification. Once paid you can submit — and resubmit as many times as needed if the carrier asks for changes — at no extra cost.
        </p>
        <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Setup fee</div>
            <div className="font-semibold">${fee.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Your credit balance</div>
            <div className={`font-semibold ${insufficient ? "text-destructive" : ""}`}>${balance.toFixed(2)}</div>
          </div>
          <div className="ml-auto flex gap-2">
            {insufficient && (
              <Button asChild variant="outline">
                <Link to="/app/billing">Top up credits</Link>
              </Button>
            )}
            <Button disabled={insufficient || pay.isPending} onClick={() => pay.mutate()}>
              {pay.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              Pay ${fee} and start registration
            </Button>
          </div>
        </div>
        {insufficient && (
          <p className="text-xs text-muted-foreground">
            Your balance is below ${fee}. Top up your credit balance, then come back to this page to pay and start the wizard.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
