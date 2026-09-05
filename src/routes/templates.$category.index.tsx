import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta } from "@/components/marketing/ProductKit";
import {
  CATEGORY_META,
  isTemplateCategory,
  templatesInCategory,
} from "@/lib/marketing/template-catalog";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/templates/$category/")({
  head: ({ params }) => {
    if (!isTemplateCategory(params.category)) {
      return { meta: [{ title: "Templates | Xellvio" }, { name: "robots", content: "noindex" }] };
    }
    const meta = CATEGORY_META[params.category];
    return pageHead({
      path: meta.path,
      title: meta.title,
      description: meta.description,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Templates", path: "/templates" },
        { name: meta.label, path: meta.path },
      ],
    });
  },
  loader: ({ params }) => {
    if (!isTemplateCategory(params.category)) throw notFound();
    return { category: params.category };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useLoaderData();
  const meta = CATEGORY_META[category];
  const items = templatesInCategory(category);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-sand">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 md:py-20">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <span className="px-2">/</span>
              <Link to="/templates" className="hover:text-foreground">Templates</Link>
              <span className="px-2">/</span>
              <span className="text-foreground">{meta.label}</span>
            </nav>
            <h1 className="mt-5 max-w-3xl text-4xl md:text-[52px] font-extrabold leading-[1.06] tracking-tight text-foreground">
              {meta.label}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{meta.intro}</p>
            <Link
              to={meta.product}
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:gap-2.5 transition-all"
            >
              Learn how this works in Xellvio <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <Link
                key={t.slug}
                to="/templates/$category/$slug"
                params={{ category, slug: t.slug }}
                className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
              >
                <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.tag}
                </span>
                <h2 className="mt-4 text-lg font-bold text-foreground">{t.label}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  View template <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-14 flex flex-wrap gap-3">
            {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[])
              .filter((c) => c !== category)
              .map((c) => (
                <Link
                  key={c}
                  to={CATEGORY_META[c].path}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {CATEGORY_META[c].label}
                </Link>
              ))}
          </div>
        </section>

        <ChannelCta
          title="Make one of these yours"
          body="Create a free Xellvio account and open any template in the builder."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
