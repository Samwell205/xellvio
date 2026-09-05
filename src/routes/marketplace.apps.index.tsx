import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { listApps, listCategories, type BrowseParams } from "@/lib/marketplace/catalog";
import { AppCard } from "@/components/marketplace/AppCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SearchParams = { q?: string; category?: string; sort?: BrowseParams["sort"] };

export const Route = createFileRoute("/marketplace/apps/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    category: typeof search.category === "string" && search.category ? search.category : undefined,
    sort: ["popular", "rating", "newest", "name"].includes(String(search.sort))
      ? (search.sort as BrowseParams["sort"])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Browse apps — Xellvio App Marketplace" },
      {
        name: "description",
        content:
          "Search every Xellvio integration by category: CRM, ecommerce, payments, email, analytics, booking, AI and automation.",
      },
      { property: "og:title", content: "Browse apps — Xellvio App Marketplace" },
      { property: "og:description", content: "Search and filter every integration available for Xellvio workspaces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrowseApps,
});

function BrowseApps() {
  const { q, category, sort } = Route.useSearch();
  const navigate = useNavigate({ from: "/marketplace/apps" });
  const cats = useQuery({ queryKey: ["mkt-categories"], queryFn: listCategories });
  const apps = useQuery({
    queryKey: ["mkt-apps", q ?? "", category ?? "", sort ?? "popular"],
    queryFn: () => listApps({ q, category, sort: sort ?? "popular" }),
  });

  const setSearch = (next: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Browse apps</h1>
      <p className="mt-2 text-muted-foreground">
        {apps.data ? `${apps.data.length} integrations ready to connect` : "Loading integrations…"}
      </p>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border bg-card px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q ?? ""}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            placeholder="Search apps, categories or capabilities"
            aria-label="Search apps"
            className="h-full flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <Select value={sort ?? "popular"} onValueChange={(v) => setSearch({ sort: v as BrowseParams["sort"] })}>
          <SelectTrigger className="h-11 w-full md:w-48">
            <SlidersHorizontal className="mr-2 size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most popular</SelectItem>
            <SelectItem value="rating">Highest rated</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="name">A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSearch({ category: undefined })}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            !category ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All categories
        </button>
        {cats.data?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSearch({ category: c.slug })}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              category === c.slug
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {apps.isLoading && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        {apps.data?.map((app) => (
          <AppCard key={app.id} app={app} to="/marketplace/apps/$slug" />
        ))}
      </div>

      {apps.data && apps.data.length === 0 && (
        <div className="mt-16 rounded-2xl border bg-card p-10 text-center">
          <p className="font-medium">No apps match that search</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different term, or{" "}
            <Link to="/marketplace/developers" className="text-primary underline">
              build the integration yourself
            </Link>
            .
          </p>
        </div>
      )}
    </main>
  );
}
