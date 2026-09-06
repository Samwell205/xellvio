import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Check, Minus } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta, ChannelFaq, StatsMarquee, reveal } from "@/components/marketing/ProductKit";
import {
  COMPARISONS,
  getComparison,
  relatedComparisons,
  type CompareDef,
} from "@/lib/marketing/compare";
import { faqSchema, pageHead } from "@/lib/seo";

export const Route = createFileRoute("/compare/$slug")({
  loader: ({ params }) => {
    const def = getComparison(params.slug);
    if (!def) throw notFound();
    return { def };
  },
  head: ({ params }) => {
    const def = getComparison(params.slug);
    if (!def) return {};
    return pageHead({
      path: `/compare/${def.slug}`,
      title: def.seoTitle,
      description: def.seoDescription,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Compare", path: "/compare" },
        { name: `Xellvio vs ${def.rival}`, path: `/compare/${def.slug}` },
      ],
      schema: [faqSchema(def.faq)],
    });
  },
  component: ComparePage,
});

function ComparePage() {
  const { def } = Route.useLoaderData();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <Hero def={def} />
        <StatsMarquee
          tone="lime"
          stats={[
            { value: "190+", label: "countries reached" },
            { value: "5,000", label: "messages per minute" },
            { value: "2-way", label: "conversations built in" },
            { value: "0", label: "contracts required" },
          ]}
        />
        <Verdict def={def} />
        <Table def={def} />
        <Reasons def={def} />
        <TheirStrengths def={def} />
        <Switching def={def} />
        <ChannelFaq id="faq" items={def.faq} />
        <Related slug={def.slug} />
        <ChannelCta
          title={`Try Xellvio next to ${def.rival}`}
          body="Create a free account, get starter credits and send a real campaign to your own numbers before you move a list."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

function Hero({ def }: { def: CompareDef }) {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 pb-16 md:pt-20">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <span aria-hidden className="px-2">
            /
          </span>
          <Link to="/compare" className="hover:text-foreground">
            Compare
          </Link>
          <span aria-hidden className="px-2">
            /
          </span>
          <span className="text-foreground">Xellvio vs {def.rival}</span>
        </nav>
        <div className="mt-8 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Comparison · {def.rivalCategory}
            </p>
            <h1 className="mt-5 text-[42px] sm:text-5xl md:text-[60px] font-extrabold leading-[1.03] tracking-tight text-foreground">
              {def.h1}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{def.heroBody}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
              >
                Start free <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center rounded-full border border-foreground/25 px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
              >
                See pricing
              </Link>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="rounded-[28px] bg-sand p-6 md:p-10"
          >
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="rounded-xl bg-ink px-4 py-5 text-ink-foreground">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">Xellvio</p>
                  <p className="mt-2 text-lg font-extrabold">Full platform</p>
                </div>
                <div className="rounded-xl bg-muted px-4 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {def.rival}
                  </p>
                  <p className="mt-2 text-lg font-extrabold text-foreground">{def.rivalCategory}</p>
                </div>
              </div>
              <ul className="mt-6 space-y-3">
                {def.reasons.map((r) => (
                  <li key={r.title} className="flex gap-3 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-coral" />
                    <span className="font-semibold">{r.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Verdict({ def }: { def: CompareDef }) {
  return (
    <section id="summary" className="scroll-mt-32 border-t border-border bg-background py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          The short version
        </motion.h2>
        <motion.p {...reveal} className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          {def.verdict}
        </motion.p>
      </div>
    </section>
  );
}

function Table({ def }: { def: CompareDef }) {
  return (
    <section id="comparison" className="scroll-mt-32 border-t border-border bg-sand py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Xellvio vs {def.rival}, side by side
        </motion.h2>
        <motion.div {...reveal} className="mt-10 overflow-hidden rounded-[28px] border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">
                Feature comparison between Xellvio and {def.rival}
              </caption>
              <thead>
                <tr className="bg-muted">
                  <th scope="col" className="px-6 py-4 text-sm font-bold text-foreground">
                    What you are comparing
                  </th>
                  <th scope="col" className="px-6 py-4 text-sm font-bold text-foreground">
                    Xellvio
                  </th>
                  <th scope="col" className="px-6 py-4 text-sm font-bold text-foreground">
                    {def.rival}
                  </th>
                </tr>
              </thead>
              <tbody>
                {def.rows.map((row) => (
                  <tr key={row.dimension} className="border-t border-border align-top">
                    <th scope="row" className="px-6 py-5 text-sm font-semibold text-foreground">
                      {row.dimension}
                    </th>
                    <td className="px-6 py-5 text-sm leading-relaxed text-muted-foreground">
                      <span className="flex gap-2">
                        {row.edge ? (
                          <Check className="mt-0.5 size-4 shrink-0 text-coral" />
                        ) : (
                          <Minus className="mt-0.5 size-4 shrink-0 opacity-40" />
                        )}
                        <span>{row.xellvio}</span>
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm leading-relaxed text-muted-foreground">{row.rival}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          The {def.rival} column reflects that company's publicly stated positioning at the time of
          writing, not a test of their account. Plans and features change — check their own website
          before deciding.
        </p>
      </div>
    </section>
  );
}

function Reasons({ def }: { def: CompareDef }) {
  return (
    <section id="why-xellvio" className="scroll-mt-32 border-t border-border bg-background py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Why businesses choose Xellvio
        </motion.h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {def.reasons.map((r, i) => (
            <motion.div
              key={r.title}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.04 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <h3 className="text-base font-bold text-foreground">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TheirStrengths({ def }: { def: CompareDef }) {
  return (
    <section id="when-they-fit" className="scroll-mt-32 border-t border-border bg-sand py-20">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1fr]">
        <motion.div {...reveal}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            When {def.rival} may fit you better
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
            No tool wins every situation. These are the cases where we would tell you to look at
            {" "}
            {def.rival} instead.
          </p>
        </motion.div>
        <motion.ul {...reveal} className="space-y-4 rounded-[28px] border border-border bg-card p-8">
          {def.theirStrengths.map((s) => (
            <li key={s} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-coral" />
              <span>{s}</span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Create your account",
    text: "Sign up free, get starter credits and send a test campaign to your own numbers.",
  },
  {
    title: "Bring your contacts and consent",
    text: "Import a CSV with consent dates and source, and load your opt-out list as suppressions.",
  },
  {
    title: "Get your sender approved",
    text: "Request a sender ID, toll-free verification or 10DLC registration in-app and track its status.",
  },
  {
    title: "Rebuild your best flows",
    text: "Start from a template for welcome series, keyword opt-ins and win-backs, then adjust the copy.",
  },
];

function Switching({ def }: { def: CompareDef }) {
  return (
    <section id="switching" className="scroll-mt-32 border-t border-border bg-background py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Moving from {def.rival} to Xellvio
        </motion.h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.04 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Step {i + 1}
              </span>
              <h3 className="mt-3 text-base font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </motion.div>
          ))}
        </div>
        <motion.p {...reveal} className="mt-10 text-sm text-muted-foreground">
          Want a hand with the move?{" "}
          <Link to="/contact" className="font-semibold text-foreground underline">
            Talk to us
          </Link>{" "}
          or{" "}
          <Link to="/templates" className="font-semibold text-foreground underline">
            start from a template
          </Link>
          .
        </motion.p>
      </div>
    </section>
  );
}

function Related({ slug }: { slug: string }) {
  const items = relatedComparisons(slug, 4);
  return (
    <section className="border-t border-border bg-sand py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Other comparisons
        </motion.h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((c) => (
            <Link
              key={c.slug}
              to="/compare/$slug"
              params={{ slug: c.slug }}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/30"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {c.rivalCategory}
              </span>
              <p className="mt-2 font-bold text-foreground">Xellvio vs {c.rival}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                Read
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          <Link to="/compare" className="font-semibold text-foreground underline">
            See all {COMPARISONS.length} comparisons
          </Link>
        </p>
      </div>
    </section>
  );
}
