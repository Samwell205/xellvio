import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { listApps, listCategories, POPULAR_SEARCHES } from "@/lib/marketplace/catalog";
import { AppCard } from "@/components/marketplace/AppCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/marketplace/")({
  head: () =>
    pageHead({
      path: "/marketplace",
      robots: "noindex",
      title: "Xellvio App Marketplace",
      description:
        "Browse the Xellvio App Marketplace and connect your store, CRM, forms and analytics tools to your SMS and email programs.",
    }),
  component: MarketplaceHome,
});

function MarketplaceHome() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const popular = useQuery({ queryKey: ["mkt-popular"], queryFn: () => listApps({ limit: 12 }) });
  const cats = useQuery({ queryKey: ["mkt-categories"], queryFn: listCategories });

  function search(q: string) {
    navigate({ to: "/marketplace/apps", search: { q: q || undefined, category: undefined } });
  }

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]" />
        <div className="mx-auto w-full max-w-5xl px-4 py-20 text-center md:px-6 md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> Xellvio App Marketplace
          </span>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Connect Xellvio to the tools that power your business.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            Discover powerful integrations that connect your website, CRM, ecommerce, marketing,
            payments, automation and business workflows in one intelligent ecosystem.
          </p>

          <form
            className="mx-auto mt-9 flex w-full max-w-2xl items-center gap-2 rounded-2xl border bg-card p-2 shadow-lg shadow-primary/5"
            onSubmit={(e) => {
              e.preventDefault();
              search(term);
            }}
          >
            <Search className="ml-2 size-5 shrink-0 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search the Xellvio App Marketplace"
              aria-label="Search the Xellvio App Marketplace"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" className="rounded-xl">
              Search
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Popular:</span>
            {POPULAR_SEARCHES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => search(p)}
                className="rounded-full border px-2.5 py-1 transition hover:border-primary/40 hover:text-foreground"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/marketplace/apps">Explore Apps</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/marketplace/developers">Build for Xellvio</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Value strip */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:grid-cols-3 md:px-6">
          {[
            {
              icon: Zap,
              title: "One-click connections",
              body: "Authorise once and every Xellvio automation can use the app instantly.",
            },
            {
              icon: ShieldCheck,
              title: "Secure by design",
              body: "Tokens are encrypted server-side, scoped per workspace and fully audited.",
            },
            {
              icon: Layers,
              title: "One data model",
              body: "Contacts, orders and payments map to a single canonical model across every app.",
            },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <div>
                <p className="font-medium">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Popular apps */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Popular apps</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The integrations Xellvio businesses connect first.
            </p>
          </div>
          <Link
            to="/marketplace/apps"
            className="flex items-center gap-1 text-sm font-medium text-primary"
          >
            View all <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {popular.isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          {popular.data?.map((app) => (
            <AppCard key={app.id} app={app} to="/marketplace/apps/$slug" />
          ))}
          {popular.isError && (
            <p className="text-sm text-destructive">
              We couldn't load apps right now. Please refresh.
            </p>
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 md:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Browse by category</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cats.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            {cats.data?.map((c) => (
              <Link
                key={c.id}
                to="/marketplace/apps"
                search={{ category: c.slug, q: undefined }}
                className="group rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.name}</p>
                  <span className="text-xs text-muted-foreground">{c.app_count} apps</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Developer CTA */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
        <div className="relative overflow-hidden rounded-3xl border bg-card p-8 md:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-primary/20 blur-3xl" />
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight md:text-3xl">
            Build an integration on Xellvio.
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Define actions and triggers, test in a sandbox, submit for review and reach every
            Xellvio workspace.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/marketplace/developers">Open the developer portal</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
