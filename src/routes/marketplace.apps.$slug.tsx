import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Bolt,
  Download,
  ExternalLink,
  Globe,
  Radio,
  ShieldCheck,
  Star,
} from "lucide-react";
import { AUTH_TYPE_LABELS, getApp, similarApps } from "@/lib/marketplace/catalog";
import { AppLogo } from "@/components/marketplace/AppLogo";
import { AppCard } from "@/components/marketplace/AppCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/marketplace/apps/$slug")({
  head: ({ params }) => {
    const pretty = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${pretty} integration — Xellvio App Marketplace`;
    const description = `Connect ${pretty} to Xellvio to sync contacts, orders and events, and trigger SMS automations from real business activity.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: AppDetailPage,
});

function AppDetailPage() {
  const { slug } = Route.useParams();
  const app = useQuery({ queryKey: ["mkt-app", slug], queryFn: () => getApp(slug) });
  const similar = useQuery({
    queryKey: ["mkt-similar", app.data?.id ?? ""],
    queryFn: () => similarApps(app.data?.category_id ?? null, app.data?.id ?? ""),
    enabled: !!app.data,
  });

  if (app.isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-12 md:px-6">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </main>
    );
  }

  if (!app.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold">App not found</h1>
        <p className="mt-2 text-muted-foreground">This integration may have been renamed or unpublished.</p>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/marketplace/apps">Browse all apps</Link>
        </Button>
      </main>
    );
  }

  const a = app.data;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <Link
        to="/marketplace/apps"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All apps
      </Link>

      <header className="mt-5 overflow-hidden rounded-3xl border bg-card">
        <div
          className="h-28 w-full"
          style={{
            background: a.accent_color
              ? `linear-gradient(120deg, ${a.accent_color}30, transparent 65%)`
              : "linear-gradient(120deg, hsl(var(--primary)/0.18), transparent 65%)",
          }}
        />
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-end md:p-8">
          <AppLogo name={a.name} logoUrl={a.logo_url} accentColor={a.accent_color} size="lg" className="-mt-14" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{a.name}</h1>
              {a.developers?.verification_status === "verified" && (
                <Badge className="gap-1 rounded-full">
                  <BadgeCheck className="size-3.5" /> Verified
                </Badge>
              )}
              {a.developers?.is_first_party && (
                <Badge variant="secondary" className="rounded-full">
                  Built by Xellvio
                </Badge>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">{a.tagline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {a.app_categories?.name && <span>{a.app_categories.name}</span>}
              <span className="flex items-center gap-1">
                <Download className="size-3.5" /> {a.install_count} installs
              </span>
              {!!a.rating && (
                <span className="flex items-center gap-1">
                  <Star className="size-3.5 fill-current" /> {a.rating}
                </span>
              )}
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3.5" /> {AUTH_TYPE_LABELS[a.auth_type] ?? a.auth_type}
              </span>
              <span className="capitalize">{a.pricing_type}</span>
              <span>v{a.version}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/app/apps/$slug" params={{ slug: a.slug }}>
                Connect app
              </Link>
            </Button>
            {a.website_url && (
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href={a.website_url} target="_blank" rel="noreferrer noopener">
                  Website <ExternalLink className="ml-1.5 size-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="changelog">Changelog</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5 space-y-6">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
              {a.long_description || a.short_description}
            </p>
            {!!a.app_features?.length && (
              <div className="grid gap-3 sm:grid-cols-2">
                {a.app_features.map((f) => (
                  <div key={f.id} className="rounded-xl border bg-card p-4">
                    <p className="flex items-center gap-2 font-medium">
                      <Bolt className="size-4 text-primary" /> {f.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="capabilities" className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Bolt className="size-4 text-primary" /> Actions
              </h2>
              <ul className="mt-3 space-y-2">
                {a.app_actions?.map((x) => (
                  <li key={x.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{x.name}</p>
                    <p className="text-muted-foreground">{x.description}</p>
                  </li>
                ))}
                {!a.app_actions?.length && <li className="text-sm text-muted-foreground">No actions declared yet.</li>}
              </ul>
            </div>
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Radio className="size-4 text-primary" /> Triggers
              </h2>
              <ul className="mt-3 space-y-2">
                {a.app_triggers?.map((x) => (
                  <li key={x.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{x.name}</p>
                    <p className="text-muted-foreground">{x.description}</p>
                  </li>
                ))}
                {!a.app_triggers?.length && <li className="text-sm text-muted-foreground">No triggers declared yet.</li>}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="setup" className="mt-5 space-y-4">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
              {a.setup_guide || `Connect ${a.name} from your workspace, authorise access, then choose what it may sync.`}
            </p>
            <div className="flex flex-wrap gap-3">
              {a.documentation_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={a.documentation_url} target="_blank" rel="noreferrer noopener">
                    <BookOpen className="mr-1.5 size-4" /> Documentation
                  </a>
                </Button>
              )}
              {a.privacy_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={a.privacy_url} target="_blank" rel="noreferrer noopener">
                    <Globe className="mr-1.5 size-4" /> Privacy policy
                  </a>
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="mt-5 space-y-3">
            {a.app_reviews?.length ? (
              a.app_reviews.map((r) => (
                <div key={r.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="flex items-center gap-0.5 text-primary">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="size-3.5 fill-current" />
                      ))}
                    </span>
                    {r.author_name ?? "Xellvio customer"}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.review}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No reviews yet — be the first to share your experience.</p>
            )}
          </TabsContent>

          <TabsContent value="changelog" className="mt-5 space-y-3">
            {a.app_versions?.length ? (
              a.app_versions.map((v) => (
                <div key={v.id} className="rounded-xl border p-4">
                  <p className="font-medium">v{v.version}</p>
                  <p className="text-sm text-muted-foreground">{v.changelog ?? "Initial release."}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No version history yet.</p>
            )}
          </TabsContent>
        </Tabs>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Developer</dt>
                <dd className="text-right">{a.developers?.company_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Authentication</dt>
                <dd className="text-right">{AUTH_TYPE_LABELS[a.auth_type] ?? a.auth_type}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pricing</dt>
                <dd className="text-right capitalize">{a.pricing_type}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Version</dt>
                <dd className="text-right">v{a.version}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-2">
              Xellvio encrypts every credential, scopes access to one workspace and logs every request this app makes.
            </p>
          </div>
        </aside>
      </div>

      {!!similar.data?.length && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight">Similar apps</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.data.map((s) => (
              <AppCard key={s.id} app={s} to="/marketplace/apps/$slug" />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
