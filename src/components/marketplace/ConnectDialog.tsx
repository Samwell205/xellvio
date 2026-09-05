import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ExternalLink, KeyRound, ListOrdered, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AppLogo } from "./AppLogo";
import { connectApp } from "@/lib/marketplace-apps.functions";
import { listSenderOptions } from "@/lib/marketplace-integrations.functions";
import { AUTH_TYPE_LABELS } from "@/lib/marketplace/catalog";
import { fieldError, specFor } from "@/lib/marketplace/provider-fields";
import { guideFor } from "@/lib/marketplace/setup-guides";
import { useQuery } from "@tanstack/react-query";

export type ConnectTarget = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  accent_color?: string | null;
  auth_type: string;
  setup_guide?: string | null;
};

const STEPS = ["Authorise", "Configure", "Done"] as const;

export function ConnectDialog({
  app,
  open,
  onOpenChange,
  mode = "connect",
}: {
  app: ConnectTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: "connect" | "reconnect";
}) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [syncContacts, setSyncContacts] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [webhooks, setWebhooks] = useState(true);
  const [automations, setAutomations] = useState(true);
  const qc = useQueryClient();
  const run = useServerFn(connectApp);

  const spec = useMemo(() => (app ? specFor(app.slug, app.auth_type, app.name) : null), [app]);
  const fields = spec?.fields ?? [];
  const isSmsApp = spec?.connectMode === "xellvio_sms";
  const [senderNumber, setSenderNumber] = useState("");
  const sendersFn = useServerFn(listSenderOptions);
  const senders = useQuery({
    queryKey: ["sender-options"],
    queryFn: () => sendersFn(),
    enabled: open && isSmsApp,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!app) throw new Error("No app selected");
      const credentials = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim().length > 0),
      );
      return run({
        data: {
          appId: app.id,
          connectionName: app.name,
          accountLabel: values["account_id"] || values["base_url"] || values["endpoint"] || undefined,
          credentials,
          scopes: [],
          settings: {
            ...(isSmsApp ? { sender_number: senderNumber } : {}),
            sync_contacts: syncContacts,
            sync_orders: syncOrders,
            webhooks_enabled: webhooks,
            automations_enabled: automations,
          },
        },
      });
    },
    onSuccess: (res: any) => {
      if (res?.note) toast.success(res.note);
      qc.invalidateQueries({ queryKey: ["my-installations"] });
      qc.invalidateQueries({ queryKey: ["recommended-apps"] });
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setStep(0);
      setValues({});
      setSenderNumber("");
      save.reset();
    }
  }

  if (!app) return null;
  const errors: Record<string, string | null> = Object.fromEntries(
    fields.map((f) => [f.key, fieldError(f, values[f.key] ?? "")]),
  );
  const touched = (key: string) => (values[key] ?? "").trim().length > 0;
  const canContinue = isSmsApp
    ? !!senderNumber
    : fields.every((f) => !errors[f.key]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AppLogo name={app.name} logoUrl={app.logo_url} accentColor={app.accent_color} />
            <div>
              <DialogTitle>
                {mode === "reconnect" ? `Reconnect ${app.name}` : `Connect your ${app.name} account`}
              </DialogTitle>
              <DialogDescription>
                {spec?.capabilities.verified
                  ? `Checked against ${app.name} before it is saved`
                  : (AUTH_TYPE_LABELS[app.auth_type] ?? "Secure connection")}
              </DialogDescription>

            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span
                className={`grid size-5 place-items-center rounded-full border text-[10px] ${
                  i <= step ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {i + 1}
              </span>
              <span className={i === step ? "font-medium text-foreground" : ""}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border" />}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            {(spec?.hint || app.setup_guide) && (
              <p className="text-sm text-muted-foreground">{spec?.hint || app.setup_guide}</p>
            )}
            {guide.steps.length > 0 && (
              <details open className="rounded-lg border bg-muted/30">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium">
                  <ListOrdered className="size-4 text-primary" />
                  How to get these details
                  <ChevronDown className="ml-auto size-4 text-muted-foreground" />
                </summary>
                <ol className="space-y-2 border-t px-3 py-3">
                  {guide.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
                {guide.docsUrl && (
                  <a
                    href={guide.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 border-t px-3 py-2.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    {guide.docsLabel ?? `${app.name} documentation`}
                  </a>
                )}
              </details>
            )}

            {isSmsApp && (
              <div className="space-y-2">
                <Label>Sending number</Label>
                {senders.isLoading && <p className="text-sm text-muted-foreground">Loading your numbers…</p>}
                {!senders.isLoading && (senders.data ?? []).length === 0 && (
                  <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                    You do not have a verified sending number yet. Finish SMS setup first, then come back here.
                  </p>
                )}
                <div className="space-y-2">
                  {(senders.data ?? []).map((s: { phone: string; kind: string; country: string }) => (
                    <button
                      key={s.phone}
                      type="button"
                      onClick={() => setSenderNumber(s.phone)}
                      className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition ${
                        senderNumber === s.phone ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium">{s.phone}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.kind}
                        {s.country ? ` · ${s.country}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key} className="flex items-center gap-1.5">
                  {f.secret && <KeyRound className="size-3.5 text-muted-foreground" />}
                  {f.label}
                </Label>
                <Input
                  id={f.key}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                {touched(f.key) && errors[f.key] ? (
                  <p className="text-xs text-destructive">{errors[f.key]}</p>
                ) : (
                  f.help && <p className="text-xs text-muted-foreground">{f.help}</p>
                )}
              </div>
            ))}
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              Credentials are encrypted and stored on our servers only. They are never sent to your browser again.
            </div>
            <Button className="w-full" disabled={!canContinue} onClick={() => setStep(1)}>
              Continue
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Choose what {app.name} may do inside this workspace.</p>
            {[
              { label: "Sync contacts and customers", value: syncContacts, set: setSyncContacts },
              { label: "Sync orders, payments and invoices", value: syncOrders, set: setSyncOrders },
              { label: "Receive webhooks from this app", value: webhooks, set: setWebhooks },
              { label: "Allow use in Xellvio automations", value: automations, set: setAutomations },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">{row.label}</span>
                <Switch checked={row.value} onCheckedChange={row.set} />
              </div>
            ))}
            <Separator />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {spec?.capabilities.verified ? "Verify & connect" : "Authorise & connect"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto size-12 text-primary" />
            <div>
              <p className="text-lg font-semibold">{app.name} successfully connected</p>
              <p className="text-sm text-muted-foreground">
                You can change permissions or disconnect any time from My Apps.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Connection secured and logged
            </div>
            <Button className="w-full" onClick={() => close(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
