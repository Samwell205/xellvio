import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Plug, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import { listApps, listCategories } from "@/lib/marketplace/catalog";
import {
  disconnectApp,
  listIntegrationLogs,
  listMyInstallations,
  recommendedApps,
  type InstalledApp,
} from "@/lib/marketplace-apps.functions";
import { AppCard } from "@/components/marketplace/AppCard";
import { AppLogo } from "@/components/marketplace/AppLogo";
import { ConnectDialog, type ConnectTarget } from "@/components/marketplace/ConnectDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/apps/")({
  head: () => ({
    meta: [
      { title: "App Marketplace — Xellvio" },
      { name: "description", content: "Discover, connect and manage the integrations powering your Xellvio workspace." },
      { property: "og:title", content: "App Marketplace — Xellvio" },
      { property: "og:description", content: "Connect your CRM, store, payments and automation tools to Xellvio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspaceApps,
});

function WorkspaceApps() {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [target, setTarget] = useState<ConnectTarget | null>(null);

  const installsFn = useServerFn(listMyInstallations);
  const recFn = useServerFn(recommendedApps);
  const logsFn = useServerFn(listIntegrationLogs);

  const installs = useQuery({ queryKey: ["my-installations"], queryFn: () => installsFn() });
  const recs = useQuery({ queryKey: ["recommended-apps"], queryFn: () => recFn() });
  const logs = useQuery({ queryKey: ["integration-logs"], queryFn: () => logsFn() });
  const cats = useQuery({ queryKey: ["mkt-categories"], queryFn: listCategories });
  const apps = useQuery({
    queryKey: ["mkt-apps", term, category ?? ""],
    queryFn: () => listApps({ q: term || undefined, category }),
  });

  const connectedIds = useMemo(
    () => new Set((installs.data ?? []).filter((i) => i.connection).map((i) => i.appId)),
    [installs.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">App Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Connect the tools your business already runs on — and use them inside campaigns and automations.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/marketplace">Public marketplace</Link>
        </Button>
      </div>

      <Tabs defaultValue="discover">
        <TabsList>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="installed">
            My apps{installs.data?.length ? ` (${installs.data.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-5 space-y-6">
          {!!recs.data?.length && (
            <section>
              <h2 className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-primary" /> Recommended for your workspace
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recs.data.map((r) => (
                  <AppCard
                    key={r.id}
                    to="/app/apps/$slug"
                    reason={r.reason}
                    app={{
                      name: r.name,
                      slug: r.slug,
                      tagline: r.tagline,
                      short_description: r.shortDescription,
                      logo_url: r.logoUrl,
                      accent_color: r.accentColor,
                      install_count: r.installCount,
                      rating: r.rating,
                      app_categories: r.categoryName ? { name: r.categoryName } : null,
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search apps"
                aria-label="Search apps"
                className="h-full flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                !category ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              All
            </button>
            {cats.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.slug)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  category === c.slug ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {apps.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
            {apps.data?.map((app) => (
              <div key={app.id} className="relative">
                {connectedIds.has(app.id) && (
                  <Badge className="absolute right-3 top-3 z-10 gap-1 rounded-full">
                    <CheckCircle2 className="size-3" /> Connected
                  </Badge>
                )}
                <AppCard app={app} to="/app/apps/$slug" />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="installed" className="mt-5">
          <InstalledList
            rows={installs.data ?? []}
            loading={installs.isLoading}
            onReconnect={(row) =>
              setTarget({
                id: row.appId,
                name: row.name,
                slug: row.slug,
                logo_url: row.logoUrl,
                accent_color: row.accentColor,
                auth_type: row.authType,
              })
            }
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-5">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {logs.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading activity…</div>}
                {logs.data?.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    {l.status === "ok" ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : (
                      <AlertCircle className="size-4 text-destructive" />
                    )}
                    <span className="font-medium">{l.appName ?? "App"}</span>
                    <span className="text-muted-foreground">
                      {l.eventType} · {l.action}
                    </span>
                    {l.error && <span className="text-destructive">{l.error}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(l.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {logs.data && logs.data.length === 0 && (
                  <div className="p-6 text-sm text-muted-foreground">No integration activity yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConnectDialog app={target} open={!!target} onOpenChange={(v) => !v && setTarget(null)} mode="reconnect" />
    </div>
  );
}

function InstalledList({
  rows,
  loading,
  onReconnect,
}: {
  rows: InstalledApp[];
  loading: boolean;
  onReconnect: (row: InstalledApp) => void;
}) {
  const qc = useQueryClient();
  const removeFn = useServerFn(disconnectApp);
  const remove = useMutation({
    mutationFn: (installationId: string) => removeFn({ data: { installationId, uninstall: true } }),
    onSuccess: () => {
      toast.success("App disconnected");
      qc.invalidateQueries({ queryKey: ["my-installations"] });
      qc.invalidateQueries({ queryKey: ["integration-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Skeleton className="h-40 rounded-2xl" />;

  if (!rows.length) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <Plug className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">No apps connected yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your CRM, store or payment tool to start syncing contacts and orders.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.installationId} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
          <AppLogo name={row.name} logoUrl={row.logoUrl} accentColor={row.accentColor} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium">{row.name}</p>
              <Badge variant={row.connection?.status === "active" ? "default" : "secondary"} className="rounded-full">
                {row.connection?.status ?? row.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {row.categoryName ?? "Integration"}
              {row.connection?.accountLabel ? ` · ${row.connection.accountLabel}` : ""}
              {row.connection?.lastSyncedAt
                ? ` · last sync ${new Date(row.connection.lastSyncedAt).toLocaleString()}`
                : ""}
            </p>
            {row.connection?.lastError && (
              <p className="mt-1 text-xs text-destructive">{row.connection.lastError}</p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/app/apps/$slug" params={{ slug: row.slug }}>
                <Settings2 className="mr-1.5 size-4" /> Manage
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReconnect(row)}>
              Reconnect
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(row.installationId)}
            >
              <Trash2 className="mr-1.5 size-4" /> Disconnect
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
