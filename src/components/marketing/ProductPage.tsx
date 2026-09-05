import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import {
  ChannelSubNav,
  ChannelHero,
  StatsMarquee,
  PillarGrid,
  SplitFeature,
  ChannelFaq,
  ChannelCta,
  reveal,
} from "./ProductKit";
import { EcosystemChain, RelatedProducts } from "./ecosystem";
import type { ProductPageDef } from "./product-pages";

/**
 * Renders a full Platform page from a single definition, so every product page
 * shares the same premium structure while keeping unique content.
 */
export function ProductPage({ def }: { def: ProductPageDef }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <ChannelSubNav channel={def.eyebrow.replace(/^Xellvio /, "")} items={def.subnav} />
      <main className="flex-1">
        <ChannelHero
          eyebrow={def.eyebrow}
          title={def.h1}
          body={def.heroBody}
          primary={{ label: "Start free", to: "/auth" }}
          secondary={def.secondaryCta ?? { label: "Get a demo", to: "/contact" }}
          visual={<ScreenVisual lines={def.experience.screen} />}
        />
        <StatsMarquee stats={def.stats} tone="lime" />

        {/* Section 2 — problem */}
        <section id="problem" className="scroll-mt-32 bg-background py-20">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div {...reveal}>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                {def.problem.heading}
              </h2>
              <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">{def.problem.body}</p>
            </motion.div>
            <motion.div {...reveal} className="rounded-[28px] border border-border bg-card p-8">
              <ul className="space-y-4">
                {def.problem.points.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-coral" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-7 border-t border-border pt-6 text-sm font-semibold leading-relaxed text-foreground">
                {def.problem.answer}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Section 3 — product experience */}
        <SplitFeature
          id="experience"
          flip
          heading={def.experience.heading}
          body={def.experience.body}
          points={def.experience.points}
          visual={<ScreenVisual lines={def.experience.screen} />}
        />

        {/* Section 4 — how it connects */}
        <EcosystemChain active={def.chainKey} body={def.connects} />

        {/* Section 5 — features */}
        <PillarGrid id="features" heading="What you get" items={def.features} />

        {/* Section 6 — use cases */}
        <section id="use-cases" className="scroll-mt-32 border-t border-border bg-sand py-20">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Ways businesses use it
            </motion.h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {def.useCases.map((u, i) => (
                <motion.div
                  key={u.title}
                  {...reveal}
                  transition={{ ...reveal.transition, delay: i * 0.04 }}
                  className="rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex items-start gap-3">
                    <Check className="mt-1 size-4 shrink-0 text-coral" />
                    <div>
                      <h3 className="text-base font-bold text-foreground">{u.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{u.text}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.p {...reveal} className="mt-10 text-sm text-muted-foreground">
              Looking for your industry?{" "}
              <Link to="/solutions" className="font-semibold text-foreground underline">
                See solutions by industry
              </Link>{" "}
              or{" "}
              <Link to="/templates" className="font-semibold text-foreground underline">
                start from a template
              </Link>
              .
            </motion.p>
          </div>
        </section>

        {/* Section 7 — related products */}
        <RelatedProducts items={def.related} />

        {/* Section 8 — FAQ */}
        <ChannelFaq id="faq" items={def.faq} />

        {/* Section 9 — final CTA */}
        <ChannelCta title={def.cta.title} body={def.cta.body} cta={{ label: "Create your free account", to: "/auth" }} />
      </main>
      <MarketingFooter />
    </div>
  );
}

/** Abstract, honest interface preview built from the page's own copy. */
export function ScreenVisual({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-[28px] bg-sand p-6 md:p-10">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-1.5 pb-4">
          <span className="size-2.5 rounded-full bg-coral" />
          <span className="size-2.5 rounded-full bg-lime" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <ul className="space-y-2.5">
          {lines.map((l, i) => (
            <li
              key={l}
              className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm ${
                i === 0 ? "bg-ink text-ink-foreground font-semibold" : "bg-muted text-foreground"
              }`}
            >
              <span>{l}</span>
              <ArrowRight className="size-3.5 opacity-40" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
