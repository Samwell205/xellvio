import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AppLogo } from "./AppLogo";
import { connectApp } from "@/lib/marketplace.functions";
import { AUTH_TYPE_LABELS } from "@/lib/marketplace/catalog";

export type ConnectTarget = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  accent_color?: string | null;
  auth_type: string;
  setup_guide?: string | null;
};

type Field = { key: string; label: string; placeholder?: string; secret?: boolean };

function fieldsFor(authType: string, appName: string): Field[] {
  switch (authType) {
    case "api_key":
      return [
        { key: "api_key", label: `${appName} API key`, placeholder: "Paste your API key", secret: true },
        { key: "account_id", label: "Account or store reference (optional)", placeholder: "e.g. example.myshopify.com" },
      ];
    case "bearer_token":
      return [
        { key: "access_token", label: "Access token", placeholder: "Paste your token", secret: true },
        { key: "base_url", label: "Base URL (optional)", placeholder: "https://your-instance.example.com" },
      ];
    case "oauth2":
      return [
        { key: "client_id", label: "Client ID", placeholder: "From your app settings" },
        { key: "client_secret", label: "Client secret", placeholder: "Kept encrypted server-side", secret: true },
        { key: "account_id", label: "Account reference (optional)", placeholder: "Workspace, store or location id" },
      ];
    default:
      return [
        { key: "endpoint", label: "Endpoint URL", placeholder: "https://api.example.com" },
        { key: "secret", label: "Signing secret", placeholder: "Used to sign outgoing payloads", secret: true },
      ];
  }
}

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

  const fields = useMemo(() => (app ? fieldsFor(app.auth_type, app.name) : []), [app]);

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
            sync_contacts: syncContacts,
            sync_orders: syncOrders,
            webhooks_enabled: webhooks,
            automations_enabled: automations,
          },
        },
      });
    },
    onSuccess: () => {
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
      save.reset();
    }
  }

  if (!app) return null;
  const required = fields[0];
  const canContinue = !!values[required?.key ?? ""]?.trim();

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
              <DialogDescription>{AUTH_TYPE_LABELS[app.auth_type] ?? "Secure connection"}</DialogDescription>
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
            {app.setup_guide && <p className="text-sm text-muted-foreground">{app.setup_guide}</p>}
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
                Authorise & connect
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
