import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bolt,
  CheckCircle2,
  ExternalLink,
  Radio,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { AUTH_TYPE_LABELS, getApp } from "@/lib/marketplace/catalog";
import { guideFor } from "@/lib/marketplace/setup-guides";
import {
  disconnectApp,
  listMyInstallations,
  updateConnection,
} from "@/lib/marketplace-apps.functions";
import { AppLogo } from "@/components/marketplace/AppLogo";
import { ConnectDialog } from "@/components/marketplace/ConnectDialog";
import { IntegrationTools, WorkspaceKeysCard } from "@/components/marketplace/IntegrationTools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/app/apps/$slug")({
  head: ({ params }) => {
    const pretty = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${pretty} — Xellvio App Marketplace` },
        {
          name: "description",
          content: `Connect and manage your ${pretty} integration inside Xellvio.`,
        },
        { property: "og:title", content: `${pretty} — Xellvio App Marketplace` },
        {
          property: "og:description",
          content: `Manage permissions, syncing and credentials for ${pretty}.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: WorkspaceAppDetail,
});

const SETTING_ROWS = [
  { key: "sync_contacts", label: "Sync contacts and customers" },
  { key: "sync_orders", label: "Sync orders, payments and invoices" },
  { key: "webhooks_enabled", label: "Receive webhooks from this app" },
  { key: "automations_enabled", label: "Allow use in Xellvio automations" },
] as const;

function WorkspaceAppDetail() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const app = useQuery({ queryKey: ["mkt-app", slug], queryFn: () => getApp(slug) });
  const installsFn = useServerFn(listMyInstallations);
  const installs = useQuery({ queryKey: ["my-installations"], queryFn: () => installsFn() });
  const installed = (installs.data ?? []).find((i) => i.slug === slug) ?? null;

  const updateFn = useServerFn(updateConnection);
  const removeFn = useServerFn(disconnectApp);

  const [name, setName] = useState("");
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!installed?.connection) return;
    setName(installed.connection.name ?? installed.name);
    const s = installed.connection.settings ?? {};
    setSettings(Object.fromEntries(SETTING_ROWS.map((r) => [r.key, s[r.key] !== false])));
  }, [installed?.connection?.id]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: { connectionId: installed!.connection!.id, connectionName: name, settings },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["my-installations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () =>
      removeFn({ data: { installationId: installed!.installationId, uninstall: true } }),
    onSuccess: () => {
      toast.success("App disconnected");
      qc.invalidateQueries({ queryKey: ["my-installations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (app.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!app.data) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <p className="font-medium">App not found</p>
        <Button asChild className="mt-4">
          <Link to="/app/apps">Back to marketplace</Link>
        </Button>
      </div>
    );
  }
  const a = app.data;

  return (
    <div className="space-y-6">
      <Link
        to="/app/apps"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> App Marketplace
      </Link>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5">
        <AppLogo name={a.name} logoUrl={a.logo_url} accentColor={a.accent_color} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{a.name}</h1>
            {installed?.connection ? (
              <Badge className="gap-1 rounded-full">
                <CheckCircle2 className="size-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="rounded-full">
                Not connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{a.tagline}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {AUTH_TYPE_LABELS[a.auth_type] ?? a.auth_type} · v{a.version} · {a.app_categories?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            {installed?.connection ? "Reconnect" : "Connect app"}
          </Button>
          <Button asChild variant="outline">
            <Link to="/marketplace/apps/$slug" params={{ slug: a.slug }}>
              Listing
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About this integration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {a.long_description || a.short_description}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Bolt className="size-4 text-primary" /> Actions
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {a.app_actions?.map((x) => (
                      <li key={x.id}>{x.name}</li>
                    ))}
                    {!a.app_actions?.length && <li>None declared</li>}
                  </ul>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Radio className="size-4 text-primary" /> Triggers
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {a.app_triggers?.map((x) => (
                      <li key={x.id}>{x.name}</li>
                    ))}
                    {!a.app_triggers?.length && <li>None declared</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {installed?.connection && (
            <IntegrationTools
              installationId={installed.installationId}
              slug={a.slug}
              authType={a.auth_type}
              appName={a.name}
              lastSyncedAt={installed.connection.lastSyncedAt}
              lastError={installed.connection.lastError}
            />
          )}

          {a.slug === "xellvio-connect" && <WorkspaceKeysCard />}

          {installed?.connection && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connection settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="conn-name">Connection name</Label>
                  <Input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                {SETTING_ROWS.map((r) => (
                  <div
                    key={r.key}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <span className="text-sm">{r.label}</span>
                    <Switch
                      checked={settings[r.key] !== false}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s, [r.key]: v }))}
                    />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    Save changes
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    <Trash2 className="mr-1.5 size-4" /> Disconnect app
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setup guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                {a.setup_guide ||
                  `Authorise ${a.name}, then choose what it may sync with this workspace.`}
              </p>
              <ol className="space-y-2.5">
                {guideFor(a.slug, a.auth_type).steps.map((s: string, i: number) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
              {guideFor(a.slug, a.auth_type).docsUrl && (
                <a
                  href={guideFor(a.slug, a.auth_type).docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  {guideFor(a.slug, a.auth_type).docsLabel ?? `${a.name} documentation`}
                </a>
              )}
            </CardContent>
          </Card>

          <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-2">
              Credentials are encrypted server-side and scoped to this workspace only. Every request
              is logged under Activity.
            </p>
          </div>
        </aside>
      </div>

      <ConnectDialog
        app={{
          id: a.id,
          name: a.name,
          slug: a.slug,
          logo_url: a.logo_url,
          accent_color: a.accent_color,
          auth_type: a.auth_type,
          setup_guide: a.setup_guide,
        }}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={installed?.connection ? "reconnect" : "connect"}
      />
    </div>
  );
}
