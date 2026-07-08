import { createFileRoute, Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
import {
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Sparkles,
  Upload,
  Clock,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  X,
} from "lucide-react";
import {
  getMySenderAssets,
  refreshMyVerificationStatus,
  saveCustomSenderId,
  submitSenderIdRegistration,
} from "@/lib/sender-setup.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMyTollfreeVerification } from "@/lib/tollfree-verification.functions";
import { sendTestSms } from "@/lib/sms.functions";
import { submitNumberRequest, listMyNumberRequests, cancelMyNumberRequest } from "@/lib/number-requests.functions";
import { saveBusinessProfile } from "@/lib/account.functions";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/setup-sms")({
  head: () => ({ meta: [{ title: "Set up SMS — Xellvio" }] }),
  component: SetupSmsPage,
});

import { COUNTRIES as ALL_COUNTRIES, ALPHA_SENDER_REQUIRES_REGISTRATION_SET, ALPHA_SENDER_UNSUPPORTED_SET } from "@/lib/countries";

const COUNTRIES = ALL_COUNTRIES.map((c) => ({ code: c.iso, name: c.name }));

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
    queryFn: async () =>
      (await supabase
        .from("accounts")
        .select("id,email,full_name,company,phone,legal_business_name,business_address,business_reg_number,website_url,privacy_policy_url,terms_url,contact_email,onboarding_status,telnyx_phone_number,monthly_volume_estimate,use_case_description,sample_message,opt_in_description,opt_in_screenshot_url,sms_target_countries,sms_consent_disclosures_confirmed_at")
        .maybeSingle()).data,
  });
  const assetsFn = useServerFn(getMySenderAssets);
  const assets = useQuery({
    queryKey: ["sender-assets"],
    queryFn: () => assetsFn(),
    refetchInterval: 30_000,
  });

  const refreshMut = useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sender-assets"] }),
  });

  if (account.isLoading)
    return (
      <div className="flex justify-center h-64 items-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  const a = account.data;
  const hasAssets = (assets.data?.length ?? 0) > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <MessageSquareText className="size-6 text-primary" /> Set up SMS
        </h1>
        <p className="text-sm text-muted-foreground">
          Answer a few questions and we'll handle the rest. Most setups are ready in 7–10 business
          days.
        </p>
      </div>

      <TollfreeSetupStep assets={assets.data ?? []} targetCountries={a?.sms_target_countries ?? []} />



      <SenderStatusList
        assets={assets.data ?? []}
        accountPhone={a?.phone ?? undefined}
        onRefresh={() => refreshMut.mutate()}
        refreshing={refreshMut.isPending}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["sender-assets"] });
          qc.invalidateQueries({ queryKey: ["account"] });
        }}
      />

    </div>
  );
}

function SenderStatusList({
  assets,
  accountPhone,
  onRefresh,
  refreshing,
  onSaved,
}: {
  assets: any[];
  accountPhone?: string;
  onRefresh: () => void;
  refreshing: boolean;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-3">
      <CustomSenderIdCard assets={assets} onSaved={onSaved} />
      {assets.map((s) => (
        <StatusCard key={s.id} asset={s} accountPhone={accountPhone} />
      ))}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing && <Loader2 className="size-4 animate-spin mr-2" />}Check for updates
        </Button>
      </div>
    </div>
  );
}

function CustomSenderIdCard({ assets, onSaved }: { assets: any[]; onSaved: () => void }) {
  const saveSender = useServerFn(saveCustomSenderId);
  const listReqsFn = useServerFn(listMyNumberRequests);
  const reqs = useQuery({ queryKey: ["my-number-requests"], queryFn: () => listReqsFn() });
  const reqByCountry = new Map<string, any>();
  for (const r of reqs.data ?? []) {
    const prev = reqByCountry.get(r.country);
    // Prefer provisioned > approved > others, else newest
    const rank = (s: string) => (s === "provisioned" ? 3 : s === "approved" ? 2 : s === "pending" ? 1 : 0);
    if (!prev || rank(r.status) > rank(prev.status)) reqByCountry.set(r.country, r);
  }
  const senderCountries = COUNTRIES;
  const existingSender =
    assets.find((asset) => asset.sender_kind === "sender_id")?.phone_number ?? "";
  const existingCountries = assets
    .filter((asset) => asset.sender_kind === "sender_id")
    .map((asset) => asset.country_code);
  const [senderId, setSenderId] = useState(existingSender);
  const [countries, setCountries] = useState<string[]>(
    existingCountries.length ? existingCountries : ["NG"],
  );
  const [busy, setBusy] = useState(false);
  const [infoCountry, setInfoCountry] = useState<string | null>(null);
  const [regCountry, setRegCountry] = useState<string | null>(null);


  function toggleCountry(cc: string) {
    setCountries((current) =>
      current.includes(cc) ? current.filter((x) => x !== cc) : [...current, cc],
    );
  }

  async function save() {
    if (!senderId.match(/^(?=.*[A-Z])[A-Z0-9 ]{1,11}$/)) {
      toast.error("Sender ID must be 1–11 letters, numbers, or spaces and include at least one letter");
      return;
    }
    if (countries.length === 0) {
      toast.error("Choose at least one country for this Sender ID");
      return;
    }
    setBusy(true);
    try {
      const res = await saveSender({ data: { senderId, countries } });
      toast.success(
        `Sender ID ${res.senderId} saved for ${res.countries.length} countr${res.countries.length === 1 ? "y" : "ies"}`,
      );
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save Sender ID");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 space-y-4 border-primary/30 bg-primary/5">
      <div>
        <div className="font-semibold">Use your own Sender ID</div>
        <p className="text-sm text-muted-foreground">
          Add or change the name customers see when a country supports alphanumeric Sender ID.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label>Sender ID</Label>
          <Input
            value={senderId}
            onChange={(e) =>
              setSenderId(
                e.target.value
                  .replace(/[^A-Za-z0-9 ]/g, "")
                  .replace(/\s+/g, " ")
                  .toUpperCase()
                  .slice(0, 11),
              )
            }
            placeholder="XELLIO"
            maxLength={11}
          />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={save} disabled={busy} className="w-full md:w-auto">
            {busy && <Loader2 className="size-4 animate-spin mr-2" />}
            Save Sender ID
          </Button>
        </div>
      </div>
      {(() => {
        const visible = senderCountries;
        const assetByCC = new Map(assets.map((a: any) => [a.country_code, a]));
        const regStatus = (code: string) => {
          if (!ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(code)) return null;
          const a = assetByCC.get(code) as any;
          const s = a?.verification_status as string | undefined;
          if (s === "verified") return { label: "Registered", tone: "success" as const };
          if (s === "submitted" || s === "in_review") return { label: "In review", tone: "amber" as const };
          if (s === "rejected") return { label: "Rejected", tone: "destructive" as const };
          return { label: "Registration required", tone: "amber" as const };
        };
        const statusFor = (code: string) => {
          const isAlphaUnsupported = ALPHA_SENDER_UNSUPPORTED_SET.has(code);
          const usTfAsset = assets.find((a) => a.country_code === "US" && a.sender_kind === "toll_free");
          const usReq = reqByCountry.get("US");
          const ownTfAsset = isAlphaUnsupported
            ? assets.find((a) => a.country_code === code && a.sender_kind === "toll_free")
            : null;
          const ownReq = isAlphaUnsupported ? reqByCountry.get(code) : null;
          const coveredByUs = code === "CA" && !ownTfAsset && !ownReq && (!!usTfAsset || !!usReq);
          const tfAsset = ownTfAsset ?? (coveredByUs ? usTfAsset : null);
          const req = ownReq ?? (coveredByUs ? usReq : null);
          const vStatus: string | undefined = tfAsset?.telnyx_verification_id ? (tfAsset?.verification_status ?? undefined) : undefined;
          const isVerified = vStatus === "verified";
          const isInReview =
            vStatus === "in_review" || vStatus === "submitted" || (!!tfAsset && !vStatus) ||
            req?.status === "approved" || req?.status === "provisioned" || req?.status === "pending";
          const isTfRejected = vStatus === "rejected" || req?.status === "rejected";
          let label = "Not started";
          if (isVerified) label = "Verified";
          else if (isTfRejected) label = "Rejected";
          else if (isInReview) label = coveredByUs ? "Covered by US" : "In review";
          return { isAlphaUnsupported, coveredByUs, isVerified, isInReview, isTfRejected, label, phone: tfAsset?.phone_number as string | undefined };
        };
        const toneClass = (tone: "success" | "amber" | "destructive") =>
          tone === "success" ? "bg-success/20 text-success"
          : tone === "destructive" ? "bg-destructive/20 text-destructive"
          : "bg-amber-500/20 text-amber-700 dark:text-amber-400";
        return (
          <div className="space-y-3">
            <Label>Countries</Label>
            <Select
              value=""
              onValueChange={(cc) => {
                if (ALPHA_SENDER_UNSUPPORTED_SET.has(cc)) { setInfoCountry(cc); return; }
                if (ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(cc)) {
                  if (!senderId.match(/^(?=.*[A-Z])[A-Z0-9 ]{1,11}$/)) {
                    toast.error("Enter a Sender ID above first, then pick the country to register it.");
                    return;
                  }
                  setRegCountry(cc);
                  return;
                }
                toggleCountry(cc);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a country…" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {visible.map((c) => {
                  const s = statusFor(c.code);
                  const reg = regStatus(c.code);
                  const on = countries.includes(c.code);
                  return (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span>{c.name}</span>
                        {reg ? (
                          <span className={`text-[10px] font-semibold uppercase rounded-full px-1.5 py-0.5 ${toneClass(reg.tone)}`}>{reg.label}</span>
                        ) : s.isAlphaUnsupported ? (
                          <span className={`text-[10px] font-semibold uppercase rounded-full px-1.5 py-0.5 ${
                            s.isVerified ? "bg-success/20 text-success" :
                            s.isTfRejected ? "bg-destructive/20 text-destructive" :
                            "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                          }`}>{s.label}</span>
                        ) : on ? (
                          <span className="text-[10px] font-semibold uppercase rounded-full px-1.5 py-0.5 bg-primary/20 text-primary">Selected</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Countries marked <span className="font-semibold text-amber-700 dark:text-amber-400">Registration required</span> (Kuwait, UAE, Saudi Arabia, Nigeria, India, etc.) need a one-time carrier registration. Save your Sender ID above, then pick the country here — we file the registration for you. Approval typically takes 3–10 business days.
            </p>
            {countries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {countries.map((cc) => {
                  const c = visible.find((x) => x.code === cc);
                  if (!c) return null;
                  return (
                    <span key={cc} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary bg-primary/10 text-primary text-xs">
                      {c.name}
                      <button type="button" onClick={() => toggleCountry(cc)} className="hover:bg-primary/20 rounded-full p-0.5" aria-label={`Remove ${c.name}`}>
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <RegistrationCountryDropdown
        assets={assets}
        senderId={senderId}
        onOpen={(cc) => setRegCountry(cc)}
      />

      <UsCanadaInfoDialog code={infoCountry} assets={assets} onClose={() => setInfoCountry(null)} />
      <RegistrationRequiredDialog
        code={regCountry}
        countryName={COUNTRIES.find((c) => c.code === regCountry)?.name ?? ""}
        senderId={senderId}
        asset={assets.find((a) => a.country_code === regCountry && a.sender_kind === "sender_id") ?? null}
        onClose={() => setRegCountry(null)}
      />
    </Card>
  );
}

function RegistrationCountryDropdown({
  assets, senderId, onOpen,
}: { assets: any[]; senderId: string; onOpen: (cc: string) => void }) {
  const regCountries = COUNTRIES.filter((c) => ALPHA_SENDER_REQUIRES_REGISTRATION_SET.has(c.code));
  const [pick, setPick] = useState<string>("");
  const statusFor = (cc: string) => {
    const a = assets.find((x) => x.country_code === cc && x.sender_kind === "sender_id");
    const s = a?.verification_status as string | undefined;
    if (s === "verified") return "Registered";
    if (s === "submitted" || s === "in_review") return "In review";
    if (s === "requires_registration") return "Needs registration";
    if (s === "rejected") return "Rejected";
    return "Not started";
  };
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <div className="text-sm">
        <strong>Countries that require carrier registration.</strong>
        <span className="text-muted-foreground"> Pick a country to submit your business details here — we file the registration for you, no external portal needed.</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="w-full sm:w-[320px]">
            <SelectValue placeholder="Select a country to register…" />
          </SelectTrigger>
          <SelectContent>
            {regCountries.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name} — {statusFor(c.code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          disabled={!pick || !senderId}
          onClick={() => pick && onOpen(pick)}
        >
          {senderId ? "Register sender ID" : "Save Sender ID first"}
        </Button>
      </div>
    </div>
  );
}

function RegistrationRequiredDialog({
  code, countryName, senderId, asset, onClose,
}: {
  code: string | null;
  countryName: string;
  senderId: string;
  asset: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitSenderIdRegistration);
  const status = asset?.verification_status as string | undefined;
  const isRegistered = status === "verified";
  const isSubmitted = status === "submitted" || status === "in_review";

  const mut = useMutation({
    mutationFn: () => submitFn({ data: { country: code as string, senderId } }),
    onSuccess: (r) => {
      if (r.status === "requires_registration") {
        toast.warning("Submitted — this destination needs extra carrier docs. Our team will reach out shortly.");
      } else {
        toast.success(`Registration submitted for ${countryName}. Carrier approval typically takes 3–10 business days.`);
      }
      qc.invalidateQueries({ queryKey: ["sender-assets"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not submit registration"),
  });

  return (
    <Dialog open={!!code} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register sender ID — {countryName}</DialogTitle>
          <DialogDescription>
            We'll submit this Sender ID to the local carriers for this country. No extra business form is needed here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border p-3 bg-muted/40 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Your sender ID</div>
              <div className="font-mono font-semibold">{senderId || asset?.phone_number || "—"}</div>
            </div>
            <Badge variant={isRegistered ? "default" : isSubmitted ? "secondary" : "outline"}>
              {isRegistered ? "Registered" : isSubmitted ? "In review" : "Not started"}
            </Badge>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-muted-foreground">
            We'll register <span className="font-mono text-foreground">{senderId}</span> for {countryName}. If local carriers need manual review, this status will stay in review until they approve it.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>Close</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !senderId}>
            {mut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
            Submit registration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsCanadaInfoDialog({ code, assets, onClose }: { code: string | null; assets: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const name = code === "US" ? "United States" : code === "CA" ? "Canada" : "";
  const listFn = useServerFn(listMyNumberRequests);
  const cancelFn = useServerFn(cancelMyNumberRequest);

  const reqs = useQuery({
    queryKey: ["my-number-requests"],
    queryFn: () => listFn(),
    enabled: !!code,
  });

  const ownRequest = (reqs.data ?? []).find((r: any) => r.country === code);
  const usRequest = (reqs.data ?? []).find((r: any) => r.country === "US");
  const usTfAsset = assets.find((a) => a.country_code === "US" && a.sender_kind === "toll_free");
  const ownTfAsset = code
    ? assets.find((a) => a.country_code === code && a.sender_kind === "toll_free")
    : null;
  // A US toll-free verification automatically covers Canada — no separate CA request needed.
  const coveredByUs = code === "CA" && !ownRequest && !ownTfAsset && (!!usRequest || !!usTfAsset);
  const realExisting = ownRequest ?? (coveredByUs ? usRequest : null);
  const effectiveTfAsset = ownTfAsset ?? (coveredByUs ? usTfAsset : null);
  // If a toll-free number is already provisioned (e.g. via admin) but there's no number_request row,
  // synthesize a pseudo-request so the dialog shows the carrier-review status instead of the "request a number" CTA.
  const existing: any = realExisting ?? (effectiveTfAsset
    ? {
        id: effectiveTfAsset.id,
        country: effectiveTfAsset.country_code,
        status: effectiveTfAsset.verification_status === "verified" ? "provisioned" : effectiveTfAsset.verification_status === "rejected" ? "rejected" : "approved",
        number_type: "toll_free",
        business_name: "—",
        assigned_phone_number: effectiveTfAsset.phone_number,
        admin_notes: null,
      }
    : null);

  // Translate the internal request status + our SMS provider verification status into a single
  // carrier-aware label and badge. "approved" from an admin only means the number was
  // provisioned — the carrier may still be reviewing.
  const verificationStatus: string | undefined = effectiveTfAsset?.telnyx_verification_id
    ? (effectiveTfAsset?.verification_status ?? undefined)
    : undefined;
  let carrierLabel = existing?.status ?? "";
  let carrierVariant: "default" | "secondary" | "destructive" = "secondary";
  if (verificationStatus === "verified") {
    carrierLabel = "Verified by carrier";
    carrierVariant = "default";
  } else if (verificationStatus === "rejected" || existing?.status === "rejected") {
    carrierLabel = "Rejected by carrier";
    carrierVariant = "destructive";
  } else if (
    verificationStatus === "in_review" ||
    verificationStatus === "submitted" ||
    existing?.status === "approved" ||
    existing?.status === "provisioned"
  ) {
    carrierLabel = "In carrier review";
    carrierVariant = "secondary";
  } else if (existing?.status === "pending") {
    carrierLabel = "Awaiting admin review";
    carrierVariant = "secondary";
  }

  // Submission has moved to the dedicated Toll-free Verification wizard route.


  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-number-requests"] });
    },
  });

  return (
    <Dialog open={!!code} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How sending to {name} works</DialogTitle>
          <DialogDescription>
            {coveredByUs
              ? "Your US toll-free number also covers Canada — the same verification works for both countries. You do not need a separate Canada request."
              : "US and Canadian carriers don't allow alphanumeric Sender IDs. All messages must come from a real phone number, which we provision and verify for you."}
          </DialogDescription>
        </DialogHeader>

        {coveredByUs && existing && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            <strong>No separate Canada request needed.</strong> Your US toll-free verification covers Canadian carriers too. Status below reflects your US request.
          </div>
        )}

        {existing ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">
                  {coveredByUs ? "Covered by your US toll-free request" : `Your ${name} request`}
                </div>
                <Badge variant={carrierVariant}>{carrierLabel}</Badge>
              </div>
              <div className="mt-2 text-muted-foreground space-y-1">
                <div>Type: <span className="text-foreground">{existing.number_type.replace("_", " ")}</span></div>
                <div>Business: <span className="text-foreground">{existing.business_name}</span></div>
                {existing.assigned_phone_number && <div>Number: <span className="text-foreground font-mono">{existing.assigned_phone_number}</span></div>}
                {existing.admin_notes && <div>Admin note: <span className="text-foreground">{existing.admin_notes}</span></div>}
              </div>
              {carrierLabel === "In carrier review" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  The number is provisioned, but The mobile carriers (AT&amp;T, T-Mobile, Verizon, plus Canadian carriers) are still reviewing your business details. This usually takes 1–3 weeks. Only the carrier can approve this — we cannot approve it manually.
                </p>
              )}
              {existing.status === "pending" && !coveredByUs && (
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => cancel.mutate(existing.id)} disabled={cancel.isPending}>
                  Cancel request
                </Button>
              )}
            </div>
            {existing.status === "rejected" && !coveredByUs && (
              <Button asChild className="w-full">
                <Link to="/app/toll-free-verification">Submit a new request</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 bg-muted/40 space-y-2">
              <p className="font-medium">How {name} sending works:</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>We provision a <strong>toll-free number</strong> for you automatically.</li>
                <li>You submit a one-time <strong>toll-free verification</strong> with your business details — we file it with the carriers for you.</li>
                <li>Approval typically takes <strong>1–3 weeks</strong>. The same approval covers both US and Canada.</li>
              </ul>
            </div>
            <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
              A one-time <strong>$5</strong> fee will be deducted from your credit balance to cover the phone-number provisioning &amp; carrier verification. You won't be re-charged if you retry the same submission.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {!existing && !coveredByUs && (
            <Button asChild>
              <Link to="/app/toll-free-verification">Start toll-free verification</Link>
            </Button>
          )}
          {existing?.status === "rejected" && !coveredByUs && (
            <Button asChild>
              <Link to="/app/toll-free-verification">Fix &amp; resubmit</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            <div className="text-sm text-muted-foreground mt-1">
              {asset.friendly_rejection_reason ?? "Please update your details and try again."}
            </div>
            <Link to={asset.sender_kind === "toll_free" && (asset.country_code === "US" || asset.country_code === "CA") ? "/app/toll-free-verification" : "/app/setup-sms"}>
              <Button size="sm" className="mt-3">
                Update and resubmit
              </Button>
            </Link>
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
          <div className="font-semibold">
            Setting up your sender ({asset.country_code} · {kindLabel})
          </div>
          <div className="text-sm text-muted-foreground">
            {asset.phone_number ? (
              <>
                Provisioned {identifierLabel.toLowerCase()}:{" "}
                <span className="font-mono">{asset.phone_number}</span> ·{" "}
              </>
            ) : null}
            Carrier review usually takes 7–10 business days. You can build campaigns while you wait.
          </div>
        </div>
        <Badge variant="secondary">In review</Badge>
      </div>
    </Card>
  );
}

function TestSendInline({
  defaultPhone,
  country,
}: { defaultPhone?: string; country?: string } = {}) {
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
      const r = await send({
        data: {
          to,
          body: "Test from Xellvio — your sender is working ✅ Reply STOP to opt out.",
          country,
        },
      });
      const msg = `Sent from ${r.from} (${r.country} · ${r.sender_kind.replace("_", " ")}) — status: ${r.status}`;
      setResult({ ok: true, msg, from: r.from });
      toast.success(msg);
    } catch (e: any) {
      const m = e?.message ?? "Test send failed";
      setResult({ ok: false, msg: m });
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border-t pt-4">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Test / Verify Sender ID
      </Label>
      <p className="text-xs text-muted-foreground mb-2">
        Sends one real SMS from your provisioned sender to confirm everything is working.
      </p>
      <div className="flex gap-2">
        <Input placeholder="+15551234567" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button onClick={run} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin mr-1.5" />
          ) : (
            <Send className="size-4 mr-1.5" />
          )}
          Send test
        </Button>
      </div>
      {result && (
        <div
          className={`mt-2 text-xs rounded-md px-3 py-2 ${result.ok ? "bg-success/10 text-success-foreground border border-success/30" : "bg-destructive/10 text-destructive border border-destructive/30"}`}
        >
          {result.ok ? "✅ " : "⚠️ "}
          {result.msg}
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
  terms_url: string;
  contact_email: string;
  phone: string;
  targetCountries: string[];
  monthlyVolume: number;
  useCase: string;
  sampleMessage: string;
  optInDescription: string;
  optInScreenshotPath: string;
  customSenderId: string;
};

function Wizard({ account, onDone }: { account: any; onDone: () => void }) {
  const saveBusinessProfileFn = useServerFn(saveBusinessProfile);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [consentConfirmed, setConsentConfirmed] = useState<boolean>(!!account?.sms_consent_disclosures_confirmed_at);
  const [uploading, setUploading] = useState(false);
  const [setupMessage, setSetupMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [form, setForm] = useState<WizardForm>({
    legal_business_name: account?.legal_business_name ?? "",
    business_address: account?.business_address ?? "",
    business_reg_number: account?.business_reg_number ?? "",
    website_url: account?.website_url ?? "",
    privacy_policy_url: account?.privacy_policy_url ?? "",
    terms_url: account?.terms_url ?? "",
    contact_email: account?.contact_email ?? account?.email ?? "",
    phone: account?.phone ?? "",
    targetCountries: account?.sms_target_countries?.length ? account.sms_target_countries : [],
    monthlyVolume: account?.monthly_volume_estimate ?? 10000,
    useCase: account?.use_case_description ?? "",
    sampleMessage: account?.sample_message ?? "",
    optInDescription: account?.opt_in_description ?? "",
    optInScreenshotPath: account?.opt_in_screenshot_url ?? "",
    customSenderId: "",
  });

  useEffect(() => {
    if (account)
      setForm((f) => ({
        ...f,
        legal_business_name: account.legal_business_name ?? f.legal_business_name,
        business_address: account.business_address ?? f.business_address,
        business_reg_number: account.business_reg_number ?? f.business_reg_number,
        website_url: account.website_url ?? f.website_url,
        privacy_policy_url: account.privacy_policy_url ?? f.privacy_policy_url,
        terms_url: account.terms_url ?? f.terms_url,
        contact_email: account.contact_email ?? account.email ?? f.contact_email,
        phone: account.phone ?? f.phone,
        targetCountries: account.sms_target_countries?.length
          ? account.sms_target_countries
          : f.targetCountries,
        monthlyVolume: account.monthly_volume_estimate ?? f.monthlyVolume,
        useCase: account.use_case_description ?? f.useCase,
        sampleMessage: account.sample_message ?? f.sampleMessage,
        optInDescription: account.opt_in_description ?? f.optInDescription,
        optInScreenshotPath: account.opt_in_screenshot_url ?? f.optInScreenshotPath,
        customSenderId: f.customSenderId,
      }));
  }, [account]);

  const needsCarrierDetails = form.targetCountries.some((cc) => cc === "US" || cc === "CA");
  const hasSenderIdCountry = form.targetCountries.some((cc) => cc !== "US" && cc !== "CA");
  const senderIdReady = !hasSenderIdCountry || /^(?=.*[A-Z])[A-Z0-9 ]{1,11}$/.test(form.customSenderId);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const path = `${u.user.id}/optin-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage
        .from("opt-in-assets")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      setForm((f) => ({ ...f, optInScreenshotPath: path }));
      toast.success("Screenshot uploaded");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  const saveProfile = useMutation({
    mutationFn: () => saveBusinessProfileFn({ data: {
      legal_business_name: form.legal_business_name,
      business_address: form.business_address,
      business_reg_number: form.business_reg_number,
      website_url: form.website_url,
      privacy_policy_url: form.privacy_policy_url || undefined,
      terms_url: form.terms_url || undefined,
      contact_email: form.contact_email,
      phone: form.phone,
    } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const runSetup = useMutation({
    mutationFn: async () => {
      setSetupMessage(null);
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
          customSenderId: form.customSenderId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Could not set up SMS. Please try again.");
      return json;
    },
    onSuccess: (r: any) => {
      if (r?.errors?.length) {
        const message = r.errors.map((e: any) => `${e.cc}: ${e.reason}`).join("\n");
        setSetupMessage({ type: "error", text: message });
        for (const e of r.errors) toast.error(`${e.cc}: ${e.reason}`);
      }
      if (r?.created?.length) {
        const message = `Set up ${r.created.length} sender${r.created.length === 1 ? "" : "s"}. We'll email you when verification completes.`;
        setSetupMessage({ type: "success", text: message });
        toast.success(message);
        onDone();
        return;
      }
      if (!r?.errors?.length) {
        const message =
          "SMS setup could not complete. Please adjust the highlighted details and try again.";
        setSetupMessage({ type: "error", text: message });
        toast.error(message);
      }
    },
    onError: (e: Error) => {
      const message = e.message || "Could not set up SMS. Please try again.";
      setSetupMessage({ type: "error", text: message });
      toast.error(message);
    },
  });

  function toggleCountry(cc: string) {
    setForm((f) => ({
      ...f,
      targetCountries: f.targetCountries.includes(cc)
        ? f.targetCountries.filter((x) => x !== cc)
        : [...f.targetCountries, cc],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <StepDot n={1} active={step === 1} done={step > 1} label="Choose sender" />
        <div className="h-px flex-1 bg-border" />
        <StepDot n={2} active={step === 2} done={step > 2} label="Carrier details" />
        <div className="h-px flex-1 bg-border" />
        <StepDot n={3} active={step === 3} done={false} label="Set up" />
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-5">
          <h3 className="font-semibold">Choose where you want to send</h3>
          <div className="space-y-2">
            <Label>Countries</Label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => {
                const on = form.targetCountries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    className={`px-3 py-1.5 rounded-full border text-sm ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {hasSenderIdCountry && (
            <div className="space-y-1.5">
              <Label>Your Sender ID</Label>
              <Input
                value={form.customSenderId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    customSenderId: e.target.value
                      .replace(/[^A-Za-z0-9 ]/g, "")
                      .replace(/\s+/g, " ")
                      .toUpperCase()
                      .slice(0, 11),
                  })
                }
                placeholder="XELLIO"
                maxLength={11}
              />
              <p className="text-xs text-muted-foreground">
                Use 1–11 letters, numbers, or spaces with at least one letter. Telnyx supports UK alphanumeric sender IDs without registration.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(needsCarrierDetails ? 2 : 3)}
              disabled={form.targetCountries.length === 0 || !senderIdReady}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-5">
          <h3 className="font-semibold">US/Canada carrier details</h3>
          <p className="text-sm text-muted-foreground">
            These details are only needed when you send to the United States or Canada.
          </p>

          <Field
            label="Legal business name"
              required
            v={form.legal_business_name}
            on={(v) => setForm({ ...form, legal_business_name: v })}
          />
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between gap-3">
              <span>Business address</span>
              <span className="text-xs italic text-muted-foreground">Required</span>
            </Label>
            <Textarea
              value={form.business_address}
              onChange={(e) => setForm({ ...form, business_address: e.target.value })}
              rows={2}
              placeholder="Street, City, State, ZIP"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="Business registration #"
              required
              v={form.business_reg_number}
              on={(v) => setForm({ ...form, business_reg_number: v })}
            />
            <Field
              label="Website"
              required
              v={form.website_url}
              on={(v) => setForm({ ...form, website_url: v })}
              placeholder="https://"
            />
            <Field
              label="Privacy policy URL"
              required
              v={form.privacy_policy_url}
              on={(v) => setForm({ ...form, privacy_policy_url: v })}
              placeholder="https://"
            />
            <Field
              label="Terms and conditions URL"
              required
              v={form.terms_url}
              on={(v) => setForm({ ...form, terms_url: v })}
              placeholder="https://"
            />
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
              placeholder="+15551234567"
            />
          </div>

          <div className="space-y-2">
            <Label>Roughly how many messages per month?</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {VOLUMES.map((v) => (
                <button
                  key={v.v}
                  type="button"
                  onClick={() => setForm({ ...form, monthlyVolume: v.v })}
                  className={`p-3 rounded-md border text-sm text-left ${form.monthlyVolume === v.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center justify-between gap-3">
              <span>What will you text people about?</span>
              <span className="text-xs italic text-muted-foreground">Required</span>
            </Label>
            <Textarea
              rows={3}
              value={form.useCase}
              onChange={(e) => setForm({ ...form, useCase: e.target.value })}
              placeholder="e.g. New product launches, restock alerts, and seasonal sale notifications for our customers who opted in at checkout."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center justify-between gap-3">
              <span>Sample message a subscriber would receive</span>
              <span className="text-xs italic text-muted-foreground">Required</span>
            </Label>
            <Textarea
              rows={2}
              value={form.sampleMessage}
              onChange={(e) => setForm({ ...form, sampleMessage: e.target.value })}
              placeholder="Hi Sam! Our spring sale starts today — 20% off everything with code SPRING20. Reply STOP to opt out."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center justify-between gap-3">
              <span>How do subscribers opt in?</span>
              <span className="text-xs italic text-muted-foreground">Required</span>
            </Label>
            <Textarea
              rows={3}
              value={form.optInDescription}
              onChange={(e) => setForm({ ...form, optInDescription: e.target.value })}
              placeholder="At checkout customers check a box that says 'Yes, send me SMS updates'. The box is unchecked by default."
            />
            <div className="flex items-center gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted">
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload sign-up form screenshot
                </span>
              </label>
              {form.optInScreenshotPath && (
                <span className="text-xs text-success">✓ Screenshot attached</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="text-sm font-semibold">Required disclosures in your opt-in flow</div>
            <p className="text-xs text-muted-foreground">
              Carriers require your sign-up form to clearly state your business identity, message purpose and frequency, "message and data rates may apply," links to your Privacy Policy and Terms, and how to opt out (Reply STOP) and get help (Reply HELP). See the full{" "}
              <Link to="/sms-terms" target="_blank" className="text-primary hover:underline">SMS Terms & Consent</Link>.
            </p>
            <div className="rounded-md bg-background border border-border p-3 text-xs leading-relaxed text-foreground">
              <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide text-[10px]">Sample consent language</div>
              "By providing your phone number and checking this box, you agree to receive recurring automated marketing and informational text messages from <em>[Your Business]</em> at the number provided. Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. See our Privacy Policy [link] and Terms [link]."
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border accent-primary"
              />
              <span className="text-foreground">
                I confirm my opt-in flow includes all the disclosures above and that I retain records of consent for every recipient.
              </span>
            </label>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={async () => {
                await saveProfile.mutateAsync();
                try {
                  const { data: u } = await supabase.auth.getUser();
                  if (u.user) {
                    const { LEGAL_VERSION } = await import("@/content/legal");
                    await supabase.from("accounts").update({
                      sms_consent_disclosures_confirmed_at: new Date().toISOString(),
                      sms_consent_disclosures_version: LEGAL_VERSION,
                    }).eq("id", u.user.id);
                  }
                } catch {
                  // best-effort: continue even if persistence fails
                }
                setStep(3);
              }}
              disabled={
                !form.useCase ||
                !form.sampleMessage ||
                !form.optInDescription ||
                form.targetCountries.length === 0 ||
                !consentConfirmed ||
                !form.legal_business_name ||
                !form.business_address ||
                !form.business_reg_number ||
                !form.website_url ||
                !/^https?:\/\//.test(form.website_url.trim()) ||
                !/^https:\/\//.test(form.privacy_policy_url.trim()) ||
                !/^https:\/\//.test(form.terms_url.trim()) ||
                !form.contact_email ||
                !/^\+[1-9][0-9]{6,14}$/.test(form.phone.trim()) ||
                !form.optInScreenshotPath ||
                saveProfile.isPending
              }
            >
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
            We'll save your Sender ID for supported countries and submit any required carrier
            registration in the background. You can test each ready sender from this page.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Button variant="outline" onClick={() => setStep(needsCarrierDetails ? 2 : 1)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => runSetup.mutate()}
              disabled={runSetup.isPending}
              size="lg"
            >
              {runSetup.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              {runSetup.isPending ? "Setting up..." : "Set up my SMS"}
            </Button>
          </div>
          {setupMessage && (
            <div
              className={`mx-auto mt-2 max-w-lg whitespace-pre-line rounded-md border px-3 py-2 text-sm ${setupMessage.type === "success" ? "border-success/40 bg-success/10 text-success-foreground" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
            >
              {setupMessage.text}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function StepDot({
  n,
  active,
  done,
  label,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      <div
        className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold border ${done ? "bg-success text-success-foreground border-success" : active ? "border-primary text-primary" : "border-border"}`}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </div>
      <span className="text-sm font-medium hidden sm:inline">{label}</span>
    </div>
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
    <div className="space-y-1.5">
      <Label className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {required && <span className="text-xs italic text-muted-foreground">Required</span>}
      </Label>
      <Input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}

function TollfreeSetupStep({ assets, targetCountries }: { assets: any[]; targetCountries: string[] }) {
  const loadTf = useServerFn(getMyTollfreeVerification);
  const tf = useQuery({ queryKey: ["tollfree-verification"], queryFn: () => loadTf() });
  const asset = (tf.data as any)?.asset ?? null;
  const status: string | null = asset?.telnyx_verification_id ? (asset?.verification_status ?? null) : null;

  const needsUsCa =
    (targetCountries ?? []).some((c) => c === "US" || c === "CA") ||
    assets.some((a) => (a.country_code === "US" || a.country_code === "CA") && a.sender_kind === "toll_free");

  const [skipped, setSkipped] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("xv:tf-skipped") === "1";
  });

  // Auto-show when verified or in review — status is useful info even if skipped.
  const showAnyway = status === "verified" || status === "in_review" || status === "submitted" || status === "rejected";

  if (!showAnyway && !needsUsCa) return null;

  let badge = (
    <Badge variant="outline" className="gap-1"><Clock className="size-3" /> Not started</Badge>
  );
  let blurb = needsUsCa
    ? "You're targeting US or Canada. US carriers (AT&T, T-Mobile, Verizon) require toll-free verification before they will deliver your messages."
    : "Only required to send SMS to US or Canada. Skip if you don't plan to send there.";
  if (status === "verified") {
    badge = <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-500 text-white"><CheckCircle2 className="size-3" /> Approved</Badge>;
    blurb = `Your toll-free number ${asset?.phone_number ?? ""} is approved for US/Canada delivery.`;
  } else if (status === "rejected") {
    blurb = asset?.friendly_rejection_reason ?? "Carrier rejected the submission — open to resubmit.";
    badge = <Badge variant="destructive" className="gap-1"><X className="size-3" /> Rejected</Badge>;
  } else if (status === "in_review" || status === "submitted") {
    badge = <Badge className="gap-1 bg-blue-500 hover:bg-blue-500 text-white"><Clock className="size-3" /> In review</Badge>;
    blurb = "Carrier is reviewing your submission (typically 1–3 weeks). You can keep using the rest of the app.";
  }

  return (
    <Card className="p-5 space-y-3 border-primary/30 bg-primary/5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          Toll-free verification (US &amp; Canada)
        </div>
        {badge}
      </div>
      <p className="text-sm text-muted-foreground">{blurb}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/app/toll-free-verification">
            {status ? "Open verification" : "Start toll-free verification"}
            <ArrowRight className="size-3.5 ml-1" />
          </Link>
        </Button>
        {!status && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.localStorage.setItem("xv:tf-skipped", "1");
              setSkipped(true);
              toast.message("Skipped — you can start it any time from Settings.");
            }}
          >
            Skip for now
          </Button>
        )}
      </div>
    </Card>
  );
}
