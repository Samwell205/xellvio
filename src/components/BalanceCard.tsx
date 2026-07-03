import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Phone, AlertTriangle, CheckCircle2, XCircle, PlayCircle, PauseCircle } from "lucide-react";
import { getTwilioBalance, refreshTwilioBalance, updateTwilioBalanceSettings, resumePausedCampaignsNow, sendTestCapacityAlert } from "@/lib/twilio-balance.functions";

function formatMoney(n: number, currency: string) {
  try {
    return n.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function BalanceCard() {
  const getFn = useServerFn(getTwilioBalance);
  const refreshFn = useServerFn(refreshTwilioBalance);
  const updateFn = useServerFn(updateTwilioBalanceSettings);
  const resumeFn = useServerFn(resumePausedCampaignsNow);
  const testFn = useServerFn(sendTestCapacityAlert);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["twilio-balance"],
    queryFn: () => getFn(),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: () => {
      toast.success("SMS balance refreshed");
      qc.invalidateQueries({ queryKey: ["twilio-balance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [lowT, setLowT] = useState<number>(20);
  const [critT, setCritT] = useState<number>(5);
  const [email, setEmail] = useState<string>("");
  const [emails, setEmails] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [buffer, setBuffer] = useState<number>(5);
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (q.data?.settings) {
      setLowT(q.data.settings.threshold_low);
      setCritT(q.data.settings.threshold_critical);
      setEmail(q.data.settings.alert_email);
      setEmails(q.data.settings.alert_emails ?? "");
      setPhone(q.data.settings.alert_phone_e164 ?? "");
      setBuffer(q.data.settings.balance_buffer_usd ?? 5);
      setEnabled(q.data.settings.alerts_enabled);
    }
  }, [q.data?.settings.threshold_low, q.data?.settings.threshold_critical, q.data?.settings.alert_email, q.data?.settings.alerts_enabled]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          threshold_low: lowT,
          threshold_critical: critT,
          alert_email: email,
          alert_emails: emails,
          alert_phone_e164: phone,
          balance_buffer_usd: buffer,
          alerts_enabled: enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Alert settings saved");
      qc.invalidateQueries({ queryKey: ["twilio-balance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resume = useMutation({
    mutationFn: () => resumeFn(),
    onSuccess: (r: any) => {
      toast.success(
        r?.resumed > 0
          ? `Resumed ${r.resumed} campaign${r.resumed === 1 ? "" : "s"}`
          : "No campaigns could be resumed yet (SMS balance still too low)",
      );
      qc.invalidateQueries({ queryKey: ["twilio-balance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (r: any) => {
      const emailList = (r?.emails ?? []).join(", ");
      toast.success(
        `Test alert fired → ${r?.emails?.length ?? 0} email(s)${emailList ? ` (${emailList})` : ""} + SMS to ${r?.phone || "—"}. Allow up to 1 min for delivery.`,
        { duration: 8000 },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = q.data?.latest;
  const status = (latest?.status ?? "healthy") as "healthy" | "low" | "critical" | "error";
  const balance = Number(latest?.balance ?? 0);
  const currency = latest?.currency ?? "USD";
  const pausedCount = q.data?.pausedCampaignCount ?? 0;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="size-5" />
          <h3 className="font-semibold">SMS account balance</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          Refresh now
        </Button>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Current balance</div>
          <div className="text-3xl font-extrabold tabular-nums">
            {latest ? formatMoney(balance, currency) : "—"}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {latest?.error_message && (
        <div className="text-xs text-destructive">Last error: {latest.error_message}</div>
      )}

      <div className="text-xs text-muted-foreground">
        {latest?.checked_at
          ? `Last checked ${new Date(latest.checked_at).toLocaleString()}`
          : "Not checked yet — click Refresh now."}
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong>Tip:</strong> Enable <a className="underline" href="https://portal.telnyx.com/#/app/billing/auto-recharge" target="_blank" rel="noreferrer">Auto-Recharge</a> in the Telnyx Portal so your account is topped up automatically when your balance drops below your chosen threshold. This card is your safety net in case Auto-Recharge fails or is off.
      </div>

      {pausedCount > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center gap-3">
          <PauseCircle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              {pausedCount} campaign{pausedCount === 1 ? "" : "s"} paused — waiting for funds
            </div>
            <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
              They'll auto-resume on the next balance check. Click below to resume immediately once funded.
            </div>
          </div>
          <Button size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}>
            <PlayCircle className="size-4 mr-1.5" />
            {resume.isPending ? "Checking..." : "Resume now"}
          </Button>
        </div>
      )}

      <div className="border-t pt-4 space-y-3">
        <h4 className="font-medium text-sm">Alert settings</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lowT">Low threshold (USD)</Label>
            <Input id="lowT" type="number" min={0} step={1} value={lowT} onChange={(e) => setLowT(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="critT">Critical threshold (USD)</Label>
            <Input id="critT" type="number" min={0} step={1} value={critT} onChange={(e) => setCritT(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="buf">Safety buffer (USD)</Label>
            <Input id="buf" type="number" min={0} step={1} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground mt-1">Required headroom above campaign cost before sending.</p>
          </div>
          <div>
            <Label htmlFor="aphone">Urgent SMS phone (E.164)</Label>
            <Input id="aphone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348106199368" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="aemails">Urgent alert emails (comma-separated)</Label>
            <Input id="aemails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ops@example.com, alerts@example.com" />
            <p className="text-[11px] text-muted-foreground mt-1">Used for "platform at capacity" urgent alerts (3 admins).</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="aemail">Standard threshold alert email</Label>
            <Input id="aemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium text-sm">Enable alerts</div>
              <div className="text-xs text-muted-foreground">Email + SMS notifications for low balance and paused campaigns.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !enabled}>
            {test.isPending ? "Sending..." : "Send test alert"}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: "healthy" | "low" | "critical" | "error" }) {
  if (status === "healthy")
    return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="size-3" />Healthy</Badge>;
  if (status === "low")
    return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500"><AlertTriangle className="size-3" />Low</Badge>;
  if (status === "critical")
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />Critical</Badge>;
  return <Badge variant="outline" className="gap-1"><XCircle className="size-3" />Error</Badge>;
}

export function LowBalanceBanner() {
  const getFn = useServerFn(getTwilioBalance);
  const q = useQuery({
    queryKey: ["twilio-balance"],
    queryFn: () => getFn(),
    refetchInterval: 5 * 60_000,
  });
  const latest = q.data?.latest;
  const pausedCount = q.data?.pausedCampaignCount ?? 0;
  if (!latest && pausedCount === 0) return null;
  const status = (latest?.status ?? "healthy") as "healthy" | "low" | "critical" | "error";
  if (status === "healthy" && pausedCount === 0) return null;

  const isCritical = status === "critical" || pausedCount > 0;
  const balance = Number(latest?.balance ?? 0);
  const currency = latest?.currency ?? "USD";

  return (
    <div
      className={`rounded-md border px-4 py-2.5 text-sm flex items-center gap-2 ${
        isCritical
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : status === "error"
          ? "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
          : "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
      }`}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <div className="flex-1">
        {pausedCount > 0 ? (
          <><strong>{pausedCount} campaign{pausedCount === 1 ? "" : "s"} paused</strong> — SMS balance {formatMoney(balance, currency)}. Top up now to auto-resume.</>
        ) : status === "error" ? (
          <>SMS balance check failed: {latest?.error_message ?? "unknown error"}</>
        ) : (
          <>
            SMS balance is <strong>{isCritical ? "critically " : ""}low</strong>: {formatMoney(balance, currency)}. Top up to avoid SMS interruptions.
          </>
        )}
      </div>
      <a
        href="https://portal.telnyx.com/#/app/billing/payments"
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline shrink-0"
      >
        Top up
      </a>
    </div>
  );
}
