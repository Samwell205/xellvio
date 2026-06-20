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
import { getTwilioBalance, refreshTwilioBalance, updateTwilioBalanceSettings, resumePausedCampaignsNow } from "@/lib/twilio-balance.functions";

function formatMoney(n: number, currency: string) {
  try {
    return n.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function TwilioBalanceCard() {
  const getFn = useServerFn(getTwilioBalance);
  const refreshFn = useServerFn(refreshTwilioBalance);
  const updateFn = useServerFn(updateTwilioBalanceSettings);
  const resumeFn = useServerFn(resumePausedCampaignsNow);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["twilio-balance"],
    queryFn: () => getFn(),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: () => {
      toast.success("Twilio balance refreshed");
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
          alerts_enabled: enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Twilio alert settings saved");
      qc.invalidateQueries({ queryKey: ["twilio-balance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = q.data?.latest;
  const status = (latest?.status ?? "healthy") as "healthy" | "low" | "critical" | "error";
  const balance = Number(latest?.balance ?? 0);
  const currency = latest?.currency ?? "USD";

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="size-5" />
          <h3 className="font-semibold">Twilio account balance</h3>
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
        <strong>Tip:</strong> Enable <a className="underline" href="https://console.twilio.com/us1/billing/manage-billing/recharge" target="_blank" rel="noreferrer">Twilio Auto-Recharge</a> so Twilio automatically charges your card when your balance drops below your chosen threshold. This card is your safety net in case Auto-Recharge fails or is off.
      </div>

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
          <div className="sm:col-span-2">
            <Label htmlFor="aemail">Alert email</Label>
            <Input id="aemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium text-sm">Enable email alerts</div>
              <div className="text-xs text-muted-foreground">Send an email when balance crosses a threshold (one per state change).</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <div className="flex justify-end">
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

export function TwilioLowBalanceBanner() {
  const getFn = useServerFn(getTwilioBalance);
  const q = useQuery({
    queryKey: ["twilio-balance"],
    queryFn: () => getFn(),
    refetchInterval: 5 * 60_000,
  });
  const latest = q.data?.latest;
  if (!latest) return null;
  const status = latest.status as "healthy" | "low" | "critical" | "error";
  if (status === "healthy") return null;

  const isCritical = status === "critical";
  const balance = Number(latest.balance ?? 0);
  const currency = latest.currency ?? "USD";

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
        {status === "error" ? (
          <>Twilio balance check failed: {latest.error_message ?? "unknown error"}</>
        ) : (
          <>
            Twilio balance is <strong>{isCritical ? "critically " : ""}low</strong>: {formatMoney(balance, currency)}. Top up to avoid SMS interruptions.
          </>
        )}
      </div>
      <a
        href="https://console.twilio.com/us1/billing/manage-billing/recharge"
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline shrink-0"
      >
        Top up
      </a>
    </div>
  );
}
