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
} from "lucide-react";
import {
  getMySenderAssets,
  refreshMyVerificationStatus,
  saveCustomSenderId,
} from "@/lib/sender-setup.functions";
import { sendTestSms } from "@/lib/sms.functions";
import { submitNumberRequest, listMyNumberRequests, cancelMyNumberRequest } from "@/lib/number-requests.functions";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/setup-sms")({
  head: () => ({ meta: [{ title: "Set up SMS — Xellio" }] }),
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

      {hasAssets ? (
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
      ) : (
        <Wizard
          account={a}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["sender-assets"] });
            qc.invalidateQueries({ queryKey: ["account"] });
          }}
        />
      )}
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
  // US & CA do not support alphanumeric Sender IDs (carrier rule) — shown but disabled.
  const ALPHA_UNSUPPORTED = new Set(["US", "CA"]);
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


  function toggleCountry(cc: string) {
    setCountries((current) =>
      current.includes(cc) ? current.filter((x) => x !== cc) : [...current, cc],
    );
  }

  async function save() {
    if (!senderId.match(/^[A-Z0-9]{3,11}$/)) {
      toast.error("Sender ID must be 3–11 letters or numbers");
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
                  .replace(/[^A-Za-z0-9]/g, "")
                  .toUpperCase()
                  .slice(0, 11),
              )
            }
            placeholder="SAMWELLAGEN"
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
      <div className="flex flex-wrap gap-2">
        {senderCountries.map((c) => {
          const on = countries.includes(c.code);
          const isAlphaUnsupported = ALPHA_UNSUPPORTED.has(c.code);
          // For US/CA, the source of truth is Twilio toll-free verification status on the
          // sender_asset — NOT the internal number_request (auto-approved at purchase).
          const tfAsset = isAlphaUnsupported
            ? assets.find((a) => a.country_code === c.code && a.sender_kind === "toll_free")
            : null;
          // Only trust the carrier status when there's an actual Twilio verification SID.
          const vStatus: string | undefined = tfAsset?.verification_sid
            ? (tfAsset?.verification_status ?? undefined)
            : undefined;
          const req = isAlphaUnsupported ? reqByCountry.get(c.code) : null;
          const hasNumber = !!tfAsset?.phone_number;
          const isVerified = vStatus === "verified";
          const isInReview = vStatus === "in_review" || vStatus === "submitted";
          const isTfRejected = vStatus === "rejected" || req?.status === "rejected";
          const notStarted = isAlphaUnsupported && !tfAsset && !req;
          let chipCls: string;
          if (isAlphaUnsupported) {
            if (isVerified) {
              chipCls = "border-success bg-success/10 text-success hover:bg-success/15";
            } else if (isTfRejected) {
              chipCls = "border-dashed border-destructive/50 bg-destructive/5 text-destructive hover:bg-destructive/10";
            } else {
              chipCls = "border-dashed border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10";
            }
          } else {
            chipCls = on
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted";
          }
          const titleText = isVerified
            ? `Verified by Twilio · ${tfAsset?.phone_number ?? ""}`
            : isTfRejected
              ? `Rejected by Twilio${tfAsset?.friendly_rejection_reason ? ` · ${tfAsset.friendly_rejection_reason}` : tfAsset?.rejection_reason ? ` · ${tfAsset.rejection_reason}` : ""}`
              : isInReview
                ? "Awaiting Twilio carrier review — only Twilio can approve this (typically 1–3 weeks)."
                : notStarted
                  ? "Submit toll-free verification to begin the Twilio review."
                  : "Pending";
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                if (isAlphaUnsupported) {
                  setInfoCountry(c.code);
                } else {
                  toggleCountry(c.code);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition ${chipCls}`}
              title={titleText}
            >
              {isVerified && <CheckCircle2 className="size-3.5" />}
              {(isInReview || (isAlphaUnsupported && !isVerified && !isTfRejected)) && (
                <Clock className="size-3.5" />
              )}
              {isTfRejected && <AlertCircle className="size-3.5" />}
              <span>
                {c.name}
                {isAlphaUnsupported && hasNumber && ` · ${tfAsset?.phone_number}`}
                {isAlphaUnsupported && !hasNumber && " · phone number"}
              </span>
              {isAlphaUnsupported && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isVerified
                      ? "bg-success/20"
                      : isTfRejected
                        ? "bg-destructive/20"
                        : "bg-amber-500/20"
                  }`}
                >
                  {isVerified
                    ? "Verified"
                    : isTfRejected
                      ? "Rejected"
                      : isInReview
                        ? "In review"
                        : "Not started"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <UsCanadaInfoDialog code={infoCountry} onClose={() => setInfoCountry(null)} />
    </Card>
  );
}

function UsCanadaInfoDialog({ code, onClose }: { code: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const name = code === "US" ? "United States" : code === "CA" ? "Canada" : "";
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    number_type: "toll_free" as "toll_free" | "ten_dlc" | "short_code",
    business_name: "",
    business_website: "",
    use_case: "",
    sample_message: "",
    expected_monthly_volume: 1000,
  });

  const listFn = useServerFn(listMyNumberRequests);
  const submitFn = useServerFn(submitNumberRequest);
  const cancelFn = useServerFn(cancelMyNumberRequest);

  const reqs = useQuery({
    queryKey: ["my-number-requests"],
    queryFn: () => listFn(),
    enabled: !!code,
  });

  const existing = (reqs.data ?? []).find((r: any) => r.country === code);

  const submit = useMutation({
    mutationFn: () => submitFn({ data: { country: code as "US" | "CA", ...form } }),
    onSuccess: (res: any) => {
      if (res?.auto?.provisioned) {
        toast.success(`Approved! Your ${code} number ${res.auto.phone_number} is ready to send.`);
      } else if (res?.auto?.note) {
        toast.message("Request submitted — manual review needed", { description: res.auto.note });
      } else {
        toast.success("Request submitted. We'll review it shortly.");
      }
      qc.invalidateQueries({ queryKey: ["my-number-requests"] });
      qc.invalidateQueries({ queryKey: ["sender-assets"] });
      setShowForm(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit request"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-number-requests"] });
    },
  });

  return (
    <Dialog open={!!code} onOpenChange={(v) => { if (!v) { setShowForm(false); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How sending to {name} works</DialogTitle>
          <DialogDescription>
            US and Canadian carriers don't allow alphanumeric Sender IDs. All messages must come from a real phone number, which we provision and verify for you.
          </DialogDescription>
        </DialogHeader>

        {existing && !showForm ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Your {name} request</div>
                <Badge variant={existing.status === "approved" || existing.status === "provisioned" ? "default" : existing.status === "rejected" ? "destructive" : "secondary"}>
                  {existing.status}
                </Badge>
              </div>
              <div className="mt-2 text-muted-foreground space-y-1">
                <div>Type: <span className="text-foreground">{existing.number_type.replace("_", " ")}</span></div>
                <div>Business: <span className="text-foreground">{existing.business_name}</span></div>
                {existing.assigned_phone_number && <div>Number: <span className="text-foreground font-mono">{existing.assigned_phone_number}</span></div>}
                {existing.admin_notes && <div>Admin note: <span className="text-foreground">{existing.admin_notes}</span></div>}
              </div>
              {existing.status === "pending" && (
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => cancel.mutate(existing.id)} disabled={cancel.isPending}>
                  Cancel request
                </Button>
              )}
            </div>
            {existing.status === "rejected" && (
              <Button onClick={() => setShowForm(true)} className="w-full">Submit a new request</Button>
            )}
          </div>
        ) : !showForm ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 bg-muted/40 space-y-2">
              <p className="font-medium">Your options for {name}:</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong>Toll-free number</strong> (recommended) — fast to provision, high-volume marketing & alerts, requires brand verification.</li>
                <li><strong>10DLC long-code</strong> — local US/CA number, requires brand + campaign registration (~1–2 weeks).</li>
                <li><strong>Short code</strong> — 5–6 digits for very high volume, slower approval and higher cost.</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Submit a request below and an admin will review it. Once approved we'll provision the number and assign it to your account.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2">
              <Label>Number type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["toll_free", "ten_dlc", "short_code"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, number_type: t }))}
                    className={`rounded-md border px-2 py-2 text-xs font-medium transition ${form.number_type === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                  >
                    {t === "toll_free" ? "Toll-free" : t === "ten_dlc" ? "10DLC" : "Short code"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Business / brand name</Label>
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Acme Inc." />
            </div>
            <div className="grid gap-2">
              <Label>Business website (optional)</Label>
              <Input value={form.business_website} onChange={(e) => setForm({ ...form, business_website: e.target.value })} placeholder="https://acme.com" />
            </div>
            <div className="grid gap-2">
              <Label>Use case</Label>
              <Textarea rows={2} value={form.use_case} onChange={(e) => setForm({ ...form, use_case: e.target.value })} placeholder="What you'll send (marketing, alerts, OTP, etc.)" />
            </div>
            <div className="grid gap-2">
              <Label>Sample message</Label>
              <Textarea rows={2} value={form.sample_message} onChange={(e) => setForm({ ...form, sample_message: e.target.value })} placeholder="Hi {first_name}, your order #1234 has shipped..." />
            </div>
            <div className="grid gap-2">
              <Label>Expected monthly volume</Label>
              <Input type="number" min={0} value={form.expected_monthly_volume} onChange={(e) => setForm({ ...form, expected_monthly_volume: Number(e.target.value) })} />
            </div>
          </div>
        )}

        <DialogFooter>
          {showForm ? (
            <>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Back</Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.business_name || form.use_case.length < 10 || form.sample_message.length < 10}>
                {submit.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              {!existing && (
                <Button onClick={() => setShowForm(true)}>Request a {name} number</Button>
              )}
            </>
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
            <Link to="/app/setup-sms">
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
          body: "Test from Xellio — your sender is working ✅ Reply STOP to opt out.",
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
    contact_email: account?.contact_email ?? account?.email ?? "",
    phone: account?.phone ?? "",
    targetCountries: account?.sms_target_countries?.length ? account.sms_target_countries : ["US"],
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
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("accounts")
        .update({
          legal_business_name: form.legal_business_name,
          business_address: form.business_address,
          business_reg_number: form.business_reg_number,
          website_url: form.website_url,
          privacy_policy_url: form.privacy_policy_url || null,
          contact_email: form.contact_email,
          phone: form.phone || null,
        })
        .eq("id", u.user.id);
      if (error) throw error;
    },
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
        <StepDot n={1} active={step === 1} done={step > 1} label="Confirm business" />
        <div className="h-px flex-1 bg-border" />
        <StepDot n={2} active={step === 2} done={step > 2} label="Tell us about your SMS" />
        <div className="h-px flex-1 bg-border" />
        <StepDot n={3} active={step === 3} done={false} label="Set up" />
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Confirm your business details</h3>
          <p className="text-sm text-muted-foreground">
            We pre-filled these from your account. Edit if anything's changed.
          </p>
          <Field
            label="Legal business name"
            v={form.legal_business_name}
            on={(v) => setForm({ ...form, legal_business_name: v })}
          />
          <div className="space-y-1.5">
            <Label>Business address</Label>
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
              v={form.business_reg_number}
              on={(v) => setForm({ ...form, business_reg_number: v })}
            />
            <Field
              label="Website"
              v={form.website_url}
              on={(v) => setForm({ ...form, website_url: v })}
              placeholder="https://"
            />
            <Field
              label="Privacy policy URL"
              v={form.privacy_policy_url}
              on={(v) => setForm({ ...form, privacy_policy_url: v })}
              placeholder="https://"
            />
            <Field
              label="Contact email"
              v={form.contact_email}
              on={(v) => setForm({ ...form, contact_email: v })}
              type="email"
            />
            <Field
              label="Business phone"
              v={form.phone}
              on={(v) => setForm({ ...form, phone: v })}
              placeholder="+15551234567"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={async () => {
                await saveProfile.mutateAsync();
                setStep(2);
              }}
              disabled={saveProfile.isPending}
            >
              Continue
            </Button>
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

          <div className="space-y-1.5">
            <Label>Your Sender ID</Label>
            <Input
              value={form.customSenderId}
              onChange={(e) =>
                setForm({
                  ...form,
                  customSenderId: e.target.value
                    .replace(/[^A-Za-z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 11),
                })
              }
              placeholder="SAMWELLAGEN"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground">
              Use 3–11 letters or numbers. Countries that support alphanumeric Sender ID will send
              from this name; US/Canada still use a number.
            </p>
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
            <Label>What will you text people about?</Label>
            <Textarea
              rows={3}
              value={form.useCase}
              onChange={(e) => setForm({ ...form, useCase: e.target.value })}
              placeholder="e.g. New product launches, restock alerts, and seasonal sale notifications for our customers who opted in at checkout."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sample message a subscriber would receive</Label>
            <Textarea
              rows={2}
              value={form.sampleMessage}
              onChange={(e) => setForm({ ...form, sampleMessage: e.target.value })}
              placeholder="Hi Sam! Our spring sale starts today — 20% off everything with code SPRING20. Reply STOP to opt out."
            />
          </div>

          <div className="space-y-1.5">
            <Label>How do subscribers opt in?</Label>
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
                  Upload sign-up form screenshot (optional)
                </span>
              </label>
              {form.optInScreenshotPath && (
                <span className="text-xs text-success">✓ Screenshot attached</span>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={
                !form.useCase ||
                !form.sampleMessage ||
                !form.optInDescription ||
                form.targetCountries.length === 0
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
            <Button variant="outline" onClick={() => setStep(2)}>
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
  v,
  on,
  placeholder,
  type,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
