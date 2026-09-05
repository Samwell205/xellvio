import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, type LucideIcon } from "lucide-react";

export const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

/* ------------------------------- channel sub-nav ------------------------------ */

export function ChannelSubNav({
  channel,
  items,
}: {
  channel: string;
  items: { label: string; hash: string }[];
}) {
  return (
    <div className="sticky top-[68px] z-30 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-5 overflow-x-auto px-5 sm:px-8 py-3 text-sm">
        <span className="shrink-0 font-semibold text-foreground">{channel}</span>
        <span className="h-4 w-px shrink-0 bg-border" />
        {items.map((i) => (
          <a
            key={i.hash}
            href={i.hash}
            className="shrink-0 whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors"
          >
            {i.label}
          </a>
        ))}
        <Link to="/pricing" className="ml-auto shrink-0 whitespace-nowrap font-medium text-foreground hover:underline">
          Pricing
        </Link>
      </div>
    </div>
  );
}

/* ---------------------------------- hero ----------------------------------- */

export function ChannelHero({
  eyebrow,
  title,
  body,
  primary,
  secondary,
  badge,
  visual,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  primary: { label: string; to: string };
  secondary: { label: string; to: string };
  badge?: string;
  visual: React.ReactNode;
}) {
  return (
    <section className="bg-background">
      <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 sm:px-8 pt-14 pb-16 md:pt-20 md:pb-24 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
            {badge && (
              <span className="rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-lime-foreground">
                {badge}
              </span>
            )}
          </div>
          <h1 className="mt-5 text-[42px] sm:text-5xl md:text-[60px] font-extrabold leading-[1.03] tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{body}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to={primary.to}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
            >
              {primary.label} <ArrowRight className="size-4" />
            </Link>
            <Link
              to={secondary.to}
              className="inline-flex items-center rounded-full border border-foreground/25 px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {secondary.label}
            </Link>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
          {visual}
        </motion.div>
      </div>
    </section>
  );
}

/* --------------------------------- marquee --------------------------------- */

export function StatsMarquee({ stats, tone = "lime" }: { stats: { value: string; label: string }[]; tone?: "lime" | "coral" }) {
  const row = [...stats, ...stats];
  return (
    <div className={`overflow-hidden border-y border-border ${tone === "lime" ? "bg-lime text-lime-foreground" : "bg-coral text-coral-foreground"}`}>
      <div className="marquee-track py-4">
        {row.map((s, i) => (
          <div key={i} className="flex shrink-0 items-center gap-4 px-8">
            <span className="text-3xl font-extrabold tracking-tight">{s.value}</span>
            <span className="max-w-[150px] text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] opacity-80">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- feature row ------------------------------- */

export function PillarGrid({
  heading,
  items,
  id,
}: {
  heading: string;
  id?: string;
  items: { icon: LucideIcon; title: string; text: string }[];
}) {
  return (
    <section id={id} className="scroll-mt-32 bg-background py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="max-w-2xl text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {heading}
        </motion.h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((f, i) => (
            <motion.div key={f.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}>
              <f.icon className="size-7 text-coral" strokeWidth={1.6} />
              <h3 className="mt-5 text-lg font-bold leading-snug text-foreground">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SplitFeature({
  id,
  heading,
  body,
  points,
  visual,
  flip,
}: {
  id?: string;
  heading: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-32 bg-background py-16 md:py-20">
      <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <motion.div {...reveal} className={flip ? "lg:order-2" : ""}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">{heading}</h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">{body}</p>
          <ul className="mt-6 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-coral" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div {...reveal} className={flip ? "lg:order-1" : ""}>
          <div className="rounded-[28px] bg-sand p-8 md:p-12">{visual}</div>
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------- proof cards ------------------------------- */

export function ProofCards({ items }: { items: { stat: string; label: string; quote: string }[] }) {
  return (
    <section className="bg-ink py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="max-w-xl text-3xl sm:text-4xl font-extrabold tracking-tight text-ink-foreground">
          Built for brands that don't settle
        </motion.h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((c, i) => (
            <motion.div key={c.label} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}
              className="overflow-hidden rounded-3xl bg-card">
              <div className="bg-coral px-7 py-10 text-coral-foreground">
                <div className="text-5xl font-extrabold tracking-tight">{c.stat}</div>
                <div className="mt-2 text-sm font-semibold">{c.label}</div>
              </div>
              <p className="px-7 py-7 text-sm leading-relaxed text-muted-foreground">{c.quote}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- faq ---------------------------------- */

export function ChannelFaq({ items, id }: { items: { q: string; a: string }[]; id?: string }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-border bg-background py-20">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Common questions
        </motion.h2>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {items.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold text-foreground">
                {f.q}
                <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- cta ---------------------------------- */

export function ChannelCta({ title, body, cta }: { title: string; body: string; cta: { label: string; to: string } }) {
  return (
    <section className="bg-background pb-24 pt-4">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.div {...reveal} className="rounded-[32px] bg-ink px-8 py-14 md:px-16 md:py-20">
          <h2 className="max-w-2xl text-3xl sm:text-4xl md:text-5xl font-extrabold leading-[1.05] tracking-tight text-ink-foreground">
            {title}
          </h2>
          <p className="mt-5 max-w-xl text-ink-foreground/70">{body}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to={cta.to}
              className="inline-flex items-center gap-1.5 rounded-full bg-lime px-6 py-3 font-semibold text-lime-foreground transition-transform hover:-translate-y-0.5"
            >
              {cta.label} <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center rounded-full border border-ink-foreground/30 px-6 py-3 font-semibold text-ink-foreground transition-colors hover:bg-ink-foreground/10"
            >
              Get a demo
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
