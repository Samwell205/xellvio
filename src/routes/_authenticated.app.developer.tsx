import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Rocket, Trash2 } from "lucide-react";
import {
  createDeveloperApiKey,
  getDeveloperOverview,
  revokeDeveloperApiKey,
  saveDeveloperApp,
  saveDeveloperProfile,
  submitAppForReview,
  testAppConnection,
} from "@/lib/marketplace-developer.functions";
import { listCategories } from "@/lib/marketplace/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/developer")({
  head: () => ({
    meta: [
      { title: "Developer portal — Xellvio App Marketplace" },
      { name: "description", content: "Create, test, submit and monitor your Xellvio marketplace integrations." },
      { property: "og:title", content: "Developer portal — Xellvio" },
      { property: "og:description", content: "Build integrations for every Xellvio workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeveloperPortal,
});

type Capability = { name: string; description?: string; entity?: string };

function DeveloperPortal() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getDeveloperOverview);
  const overview = useQuery({ queryKey: ["developer-overview"], queryFn: () => overviewFn() });
  const cats = useQuery({ queryKey: ["mkt-categories"], queryFn: listCategories });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["developer-overview"] });

  if (overview.isLoading) return <Skeleton className="h-72 rounded-2xl" />;

  const dev = overview.data?.developer ?? null;
  const stats = overview.data?.stats ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Developer portal</h1>
          <p className="text-sm text-muted-foreground">
            Publish an integration to every Xellvio workspace — actions, triggers, webhooks and analytics.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/marketplace/developers">Developer docs</Link>
        </Button>
      </div>

      {!dev ? (
        <ProfileForm onSaved={invalidate} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Apps", value: stats?.totalApps ?? 0 },
              { label: "Published", value: stats?.publishedApps ?? 0 },
              { label: "Installs", value: stats?.totalInstalls ?? 0 },
              { label: "Active workspaces", value: stats?.activeWorkspaces ?? 0 },
              { label: "API requests", value: stats?.apiRequests ?? 0 },
              { label: "Webhook events", value: stats?.webhookEvents ?? 0 },
              { label: "Errors", value: stats?.errors ?? 0 },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="apps">
            <TabsList>
              <TabsTrigger value="apps">My apps</TabsTrigger>
              <TabsTrigger value="new">Submit an app</TabsTrigger>
              <TabsTrigger value="keys">API keys</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>

            <TabsContent value="apps" className="mt-5 space-y-3">
              {(overview.data?.apps ?? []).map((app: any) => (
                <div key={app.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{app.name}</p>
                      <Badge variant={app.status === "published" ? "default" : "secondary"} className="rounded-full">
                        {String(app.status).replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      v{app.version} · {app.install_count} installs · updated{" "}
                      {new Date(app.updated_at).toLocaleDateString()}
                    </p>
                    {app.review_notes && <p className="mt-1 text-xs text-destructive">Review: {app.review_notes}</p>}
                  </div>
                  <div className="ml-auto">
                    <SubmitButton appId={app.id} status={app.status} onDone={invalidate} />
                  </div>
                </div>
              ))}
              {!overview.data?.apps?.length && (
                <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
                  No apps yet — submit your first integration from the next tab.
                </div>
              )}
            </TabsContent>

            <TabsContent value="new" className="mt-5">
              <AppForm categories={cats.data ?? []} onSaved={invalidate} />
            </TabsContent>

            <TabsContent value="keys" className="mt-5">
              <ApiKeys keys={overview.data?.apiKeys ?? []} onChanged={invalidate} />
            </TabsContent>

            <TabsContent value="profile" className="mt-5">
              <ProfileForm dev={dev} onSaved={invalidate} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SubmitButton({ appId, status, onDone }: { appId: string; status: string; onDone: () => void }) {
  const fn = useServerFn(submitAppForReview);
  const m = useMutation({
    mutationFn: () => fn({ data: { appId } }),
    onSuccess: () => {
      toast.success("Submitted for review");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (status === "in_review") return <Badge variant="secondary">Awaiting review</Badge>;
  if (status === "published") return <Badge>Live</Badge>;
  return (
    <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
      <Rocket className="mr-1.5 size-4" /> Submit for review
    </Button>
  );
}

function ProfileForm({ dev, onSaved }: { dev?: any; onSaved: () => void }) {
  const fn = useServerFn(saveDeveloperProfile);
  const [v, setV] = useState({
    companyName: dev?.company_name ?? "",
    website: dev?.website ?? "",
    supportEmail: dev?.support_email ?? "",
    description: dev?.description ?? "",
    logoUrl: dev?.logo_url ?? "",
  });
  const m = useMutation({
    mutationFn: () => fn({ data: v }),
    onSuccess: () => {
      toast.success("Developer profile saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{dev ? "Developer profile" : "Create your developer profile"}</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-2xl gap-4">
        <div className="space-y-1.5">
          <Label>Company or developer name</Label>
          <Input value={v.companyName} onChange={(e) => setV({ ...v, companyName: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} placeholder="https://" />
          </div>
          <div className="space-y-1.5">
            <Label>Support email</Label>
            <Input value={v.supportEmail} onChange={(e) => setV({ ...v, supportEmail: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Logo URL</Label>
          <Input value={v.logoUrl} onChange={(e) => setV({ ...v, logoUrl: e.target.value })} placeholder="https://" />
        </div>
        <div className="space-y-1.5">
          <Label>About your company</Label>
          <Textarea rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </div>
        <Button className="w-fit" onClick={() => m.mutate()} disabled={m.isPending}>
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}

function AppForm({ categories, onSaved }: { categories: { id: string; name: string }[]; onSaved: () => void }) {
  const saveFn = useServerFn(saveDeveloperApp);
  const testFn = useServerFn(testAppConnection);
  const [v, setV] = useState({
    name: "",
    categoryId: "",
    tagline: "",
    shortDescription: "",
    longDescription: "",
    logoUrl: "",
    websiteUrl: "",
    documentationUrl: "",
    setupGuide: "",
    authType: "api_key" as "api_key" | "oauth2" | "bearer_token" | "custom",
    pricingType: "free" as "free" | "paid" | "freemium",
    keywords: "",
    baseApiUrl: "",
    webhookUrl: "",
  });
  const [actions, setActions] = useState<Capability[]>([{ name: "", entity: "contact" }]);
  const [triggers, setTriggers] = useState<Capability[]>([{ name: "", entity: "contact" }]);
  const [testResult, setTestResult] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name: v.name,
          categoryId: v.categoryId || null,
          tagline: v.tagline,
          shortDescription: v.shortDescription,
          longDescription: v.longDescription,
          logoUrl: v.logoUrl,
          websiteUrl: v.websiteUrl,
          documentationUrl: v.documentationUrl,
          setupGuide: v.setupGuide,
          authType: v.authType,
          pricingType: v.pricingType,
          keywords: v.keywords.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20),
          authConfig: { base_api_url: v.baseApiUrl, webhook_url: v.webhookUrl },
          actions: actions.filter((a) => a.name.trim().length > 1),
          triggers: triggers.filter((t) => t.name.trim().length > 1),
        },
      }),
    onSuccess: () => {
      toast.success("App draft saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { url: v.baseApiUrl } }),
    onSuccess: (r: any) =>
      setTestResult(r.ok ? `Reachable — HTTP ${r.status} in ${r.ms}ms` : `Failed — ${r.error ?? `HTTP ${r.status}`}`),
    onError: (e: Error) => setTestResult(e.message),
  });

  const capRows = (rows: Capability[], set: (r: Capability[]) => void, label: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_150px]">
          <Input
            placeholder={`${label.slice(0, -1)} name`}
            value={r.name}
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <Input
            placeholder="Description"
            value={r.description ?? ""}
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
          />
          <Input
            placeholder="Entity (contact)"
            value={r.entity ?? ""}
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, entity: e.target.value } : x)))}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => set([...rows, { name: "" }])}>
        <Plus className="mr-1.5 size-4" /> Add {label.toLowerCase().slice(0, -1)}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submit an app</CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-3xl gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>App name</Label>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={v.categoryId} onValueChange={(x) => setV({ ...v, categoryId: x })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tagline</Label>
          <Input value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Short description</Label>
          <Input value={v.shortDescription} onChange={(e) => setV({ ...v, shortDescription: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Full description</Label>
          <Textarea rows={5} value={v.longDescription} onChange={(e) => setV({ ...v, longDescription: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Authentication</Label>
            <Select value={v.authType} onValueChange={(x) => setV({ ...v, authType: x as typeof v.authType })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api_key">API key</SelectItem>
                <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                <SelectItem value="bearer_token">Bearer token</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pricing</Label>
            <Select value={v.pricingType} onValueChange={(x) => setV({ ...v, pricingType: x as typeof v.pricingType })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="freemium">Freemium</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Keywords (comma separated)</Label>
            <Input value={v.keywords} onChange={(e) => setV({ ...v, keywords: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Base API URL</Label>
            <Input value={v.baseApiUrl} onChange={(e) => setV({ ...v, baseApiUrl: e.target.value })} placeholder="https://api.example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Webhook URL</Label>
            <Input value={v.webhookUrl} onChange={(e) => setV({ ...v, webhookUrl: e.target.value })} placeholder="https://api.example.com/hooks" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={!v.baseApiUrl || test.isPending}>
            Test connection
          </Button>
          {testResult && <span className="text-sm text-muted-foreground">{testResult}</span>}
        </div>
        <div className="space-y-1.5">
          <Label>Setup guide shown to customers</Label>
          <Textarea rows={3} value={v.setupGuide} onChange={(e) => setV({ ...v, setupGuide: e.target.value })} />
        </div>
        {capRows(actions, setActions, "Actions")}
        {capRows(triggers, setTriggers, "Triggers")}
        <Button className="w-fit" onClick={() => save.mutate()} disabled={save.isPending || v.name.trim().length < 2}>
          Save draft
        </Button>
      </CardContent>
    </Card>
  );
}

function ApiKeys({ keys, onChanged }: { keys: any[]; onChanged: () => void }) {
  const createFn = useServerFn(createDeveloperApiKey);
  const revokeFn = useServerFn(revokeDeveloperApiKey);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createFn({ data: { name } }),
    onSuccess: (r: any) => {
      setIssued(r.key);
      setName("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (keyId: string) => revokeFn({ data: { keyId } }),
    onSuccess: () => {
      toast.success("Key revoked");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!issued) return;
    const t = setTimeout(() => setIssued(null), 120_000);
    return () => clearTimeout(t);
  }, [issued]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Key name (e.g. Production)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={() => create.mutate()} disabled={name.trim().length < 2 || create.isPending}>
            <KeyRound className="mr-1.5 size-4" /> Create key
          </Button>
        </div>

        {issued && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">Copy your key now — it is shown only once.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{issued}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(issued);
                  toast.success("Key copied");
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y rounded-lg border">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-medium">{k.name}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.key_prefix}…</code>
              {k.revoked_at ? (
                <Badge variant="secondary">Revoked</Badge>
              ) : (
                <Badge>Active</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}
              </span>
              {!k.revoked_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() => revoke.mutate(k.id)}
                >
                  <Trash2 className="mr-1.5 size-4" /> Revoke
                </Button>
              )}
            </div>
          ))}
          {!keys.length && <div className="p-4 text-sm text-muted-foreground">No API keys yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
