import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, ArrowDown } from "lucide-react";
import { reveal } from "./ProductKit";

/**
 * The connected Xellvio journey. Every product page renders this with its own
 * step highlighted, so visitors (and AI search systems) can see how the
 * features fit together instead of reading each page in isolation.
 */
export const CHAIN: { key: string; label: string; role: string; to: string }[] = [
  { key: "forms", label: "Sign-up forms", role: "Collect leads", to: "/signup-forms" },
  { key: "pages", label: "Landing pages", role: "Convert visitors", to: "/landing-pages" },
  { key: "audiences", label: "Audiences & segments", role: "Organise contacts", to: "/audiences" },
  { key: "automations", label: "Automations", role: "Trigger journeys", to: "/automations" },
  { key: "sms", label: "SMS & email", role: "Engage customers", to: "/sms-marketing" },
  { key: "reporting", label: "Reporting", role: "Measure performance", to: "/reporting" },
];

export function EcosystemChain({
  active,
  heading = "How it connects to the rest of Xellvio",
  body,
  id = "connects",
}: {
  active?: string;
  heading?: string;
  body?: string;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-32 border-y border-border bg-sand py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="max-w-2xl text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {heading}
        </motion.h2>
        {body && <motion.p {...reveal} className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{body}</motion.p>}
        <ol className="mt-10 grid gap-3 md:grid-cols-6">
          {CHAIN.map((step, i) => {
            const on = step.key === active;
            return (
              <motion.li
                key={step.key}
                {...reveal}
                transition={{ ...reveal.transition, delay: i * 0.05 }}
                className="relative"
              >
                <Link
                  to={step.to}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col gap-1 rounded-2xl border p-4 transition-colors ${
                    on
                      ? "border-transparent bg-ink text-ink-foreground"
                      : "border-border bg-card text-foreground hover:border-foreground/30"
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
                    Step {i + 1}
                  </span>
                  <span className="text-sm font-bold leading-snug">{step.label}</span>
                  <span className={`text-xs ${on ? "text-ink-foreground/70" : "text-muted-foreground"}`}>
                    {step.role}
                  </span>
                </Link>
                {i < CHAIN.length - 1 && (
                  <>
                    <ArrowRight className="pointer-events-none absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground md:block" />
                    <ArrowDown className="mx-auto mt-2 size-4 text-muted-foreground md:hidden" />
                  </>
                )}
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function RelatedProducts({
  items,
  heading = "Related products",
  id = "related",
}: {
  items: { label: string; to: string; text: string }[];
  heading?: string;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-32 bg-background py-20">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <motion.h2 {...reveal} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {heading}
        </motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((r, i) => (
            <motion.div key={r.to + r.label} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}>
              <Link
                to={r.to}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
              >
                <span className="text-base font-bold text-foreground">{r.label}</span>
                <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  Explore <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
