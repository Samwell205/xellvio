import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyTollfreeVerification,
  refreshTollfreeVerification,
  submitTollfreeVerification,
  getTollfreeFeeStatus,
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
import { TollfreeWizard, defaultWizardForm, type WizardForm } from "@/components/tollfree-wizard/TollfreeWizard";

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
      if (s === "submitted" || s === "in_review") return 30_000;
      return false;
    },
    refetchIntervalInBackground: false,
  });

  const asset = data?.asset ?? null;
  const rawStatus = (asset?.verification_status as Status | "pending" | null) ?? null;
  const trustsCarrier = rawStatus === "submitted" || rawStatus === "in_review" || rawStatus === "verified";
  const status: Status | null =
    rawStatus === "pending" || (trustsCarrier && !asset?.verification_sid) ? null : rawStatus;
  const payload = (asset?.verification_payload as any) ?? null;
  const submissionStarted = !!asset?.verification_sid;
  const hasReservedNumber = !!asset && !asset.verification_sid && (!!asset.phone_number || !!asset.phone_sid);
  const localSubmissionFailure = status === "rejected" && !asset?.verification_sid;
  const isLocked = status === "submitted" || status === "in_review" || status === "verified";

  const initialForm = useMemo(() => normalizePayload(payload), [payload]);

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
    if (!asset?.verification_sid) return;
    const id = setInterval(() => {
      refresh({ data: undefined as any })
        .then(() => qc.invalidateQueries({ queryKey: ["tollfree-verification"] }))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [status, asset?.verification_sid, refresh, qc]);

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
            {(asset?.verification_sid || asset?.phone_sid) && (
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
                <div className="font-mono text-xs">{asset.verification_sid ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Last checked</div>
                <div className="text-xs">
                  {asset.last_synced_at ? new Date(asset.last_synced_at as string).toLocaleString() : "—"}
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
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">${feeQuery.data?.fee ?? 5} one-time setup.</strong> Charged from credits when you submit. It covers the toll-free number and carrier verification; resubmissions are free.
            </div>
          ) : null
        }
      />

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
            Your tenants should not buy inside Telnyx. In Xellvio they submit this wizard, are charged ${feeQuery.data?.fee ?? 5} in credits, and the platform handles number assignment plus verification.
          </p>
          {(feeQuery.data?.balance ?? 0) < (feeQuery.data?.fee ?? 5) && !feePaid && (
            <Button asChild size="sm"><Link to="/app/billing">Top up balance</Link></Button>
          )}
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
