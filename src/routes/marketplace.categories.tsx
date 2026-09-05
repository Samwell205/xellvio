import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { listCategories } from "@/lib/marketplace/catalog";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/marketplace/categories")({
  head: () =>
    pageHead({
    path: "/marketplace/categories",
    title: "Marketplace App Categories",
    description:
      "Explore Xellvio marketplace categories — ecommerce, CRM, forms, analytics, support and automation — to find the integration you need.",
    breadcrumbs: [{ name: "Home", path: "/" }, { name: "Marketplace", path: "/marketplace" }, { name: "Categories", path: "/marketplace/categories" }],
    }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const cats = useQuery({ queryKey: ["mkt-categories"], queryFn: listCategories });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Explore by category</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every integration is grouped by the job it does, so you can find the right app for your workflow in seconds.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cats.isLoading && Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        {cats.data?.map((c) => (
          <Link
            key={c.id}
            to="/marketplace/apps"
            search={{ category: c.slug, q: undefined, sort: undefined }}
            className="group flex flex-col rounded-2xl border bg-card p-5 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold tracking-tight">{c.name}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {c.app_count} apps
              </span>
            </div>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{c.description}</p>
            <span className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-70 transition-all group-hover:gap-2 group-hover:opacity-100">
              Browse {c.name} <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
