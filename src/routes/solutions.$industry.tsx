import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, ArrowDown, Check } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelFaq, ChannelCta } from "@/components/marketing/ProductKit";
import { RelatedProducts } from "@/components/marketing/ecosystem";
import { INDUSTRIES, industryBySlug } from "@/components/marketing/industries";
import { pageHead, faqSchema } from "@/lib/seo";

export const Route = createFileRoute("/solutions/$industry")({
  loader: ({ params }) => {
    if (!industryBySlug(params.industry)) throw notFound();
    return { slug: params.industry };
  },
  head: ({ params }) => {
    const ind = industryBySlug(params.industry);
    if (!ind) {
      return { meta: [{ title: "Solution unavailable | Xellvio" }, { name: "robots", content: "noindex" }] };
    }
    const path = `/solutions/${ind.slug}`;
    return pageHead({
      path,
      title: ind.seoTitle,
      description: ind.seoDescription,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Solutions", path: "/solutions" },
        { name: ind.name, path },
      ],
      schema: [faqSchema(ind.faq)],
    });
  },
  component: IndustryPage,
});

function IndustryPage() {
  const { slug } = Route.useLoaderData();
  const ind = industryBySlug(slug)!;
  const others = INDUSTRIES.filter((i) => i.slug !== slug);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-sand">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 md:py-20">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <span className="px-2">/</span>
              <Link to="/solutions" className="hover:text-foreground">Solutions</Link>
              <span className="px-2">/</span>
              <span className="text-foreground">{ind.name}</span>
            </nav>
            <h1 className="mt-5 max-w-3xl text-4xl md:text-[54px] font-extrabold leading-[1.05] tracking-tight text-foreground">
              {ind.h1}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{ind.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
              >
                Start free <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center rounded-full border border-foreground/25 px-6 py-3 font-semibold text-foreground hover:bg-muted"
              >
                Get a demo
              </Link>
            </div>
          </div>
        </section>

        {/* Problem + challenges */}
        <section className="mx-auto max-w-[1400px] grid gap-12 px-5 sm:px-8 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              What gets in the way for {ind.name.toLowerCase()}
            </h2>
            <ul className="mt-6 space-y-4">
              {ind.problems.map((p) => (
                <li key={p} className="flex gap-3 text-muted-foreground">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-coral" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-border bg-card p-8">
            <h2 className="text-lg font-bold text-foreground">The communication challenge</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{ind.challenges}</p>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-y border-border bg-background py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">What you use in Xellvio</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {ind.capabilities.map((c) => (
                <div key={c.title} className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start gap-3">
                    <Check className="mt-1 size-4 shrink-0 text-coral" />
                    <div>
                      <h3 className="text-base font-bold text-foreground">{c.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflows */}
        <section className="bg-sand py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Example workflows</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {ind.workflows.map((w) => (
                <div key={w.name} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="text-base font-bold text-foreground">{w.name}</h3>
                  <ol className="mt-5 space-y-2">
                    {w.steps.map((s, i) => (
                      <li key={s}>
                        <span className="block rounded-xl bg-muted px-4 py-2.5 text-sm text-foreground">{s}</span>
                        {i < w.steps.length - 1 && (
                          <ArrowDown className="mx-auto my-1 size-3.5 text-muted-foreground" />
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              Build these on the{" "}
              <Link to="/automations" className="font-semibold text-foreground underline">
                automation canvas
              </Link>{" "}
              — no code required.
            </p>
          </div>
        </section>

        {/* Templates */}
        <section className="border-y border-border bg-background py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Templates to start from</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              {ind.templates.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {t.label}
                </Link>
              ))}
              <Link
                to="/templates"
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-foreground"
              >
                All templates
              </Link>
            </div>
          </div>
        </section>

        <RelatedProducts items={ind.related} heading="Features behind this solution" />

        <ChannelFaq items={ind.faq} />

        {/* Other industries */}
        <section className="border-t border-border bg-sand py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Other industries</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  to="/solutions/$industry"
                  params={{ industry: o.slug }}
                  className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
                >
                  <h3 className="text-base font-bold text-foreground">{o.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{o.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    Explore <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <ChannelCta
          title={`Start your ${ind.name.toLowerCase()} messaging programme`}
          body="Create a free account, import your contacts and send your first campaign today."
          cta={{ label: "Create your free account", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
