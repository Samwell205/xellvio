import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Globe2, LayoutTemplate, ShieldCheck, Wallet } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta, ChannelFaq, reveal } from "@/components/marketing/ProductKit";
import { COMPARISONS } from "@/lib/marketing/compare";
import { faqSchema, pageHead } from "@/lib/seo";

const FAQ = [
  {
    q: "How do you decide what goes in these comparisons?",
    a: "The Xellvio column only describes features that exist in the product today. The other platform's column sticks to how that company publicly positions itself, because plans and features change often — always check their own site before deciding.",
  },
  {
    q: "Can I try Xellvio before switching?",
    a: "Yes. Create a free account, get starter credits and send a real campaign to your own numbers before you move a list across.",
  },
  {
    q: "Will I lose my consent records if I move?",
    a: "No. Import your contacts with their consent dates and source, and bring your opt-out list across as suppressions so those people are never messaged again.",
  },
  {
    q: "Do I need a different account to text other countries?",
    a: "No. One Xellvio account sends to 190+ countries, and the sender rules for each market are handled inside the app.",
  },
];

const REASONS = [
  {
    icon: Globe2,
    title: "Global from day one",
    text: "190+ countries from one account, with sender IDs, toll-free verification and carrier registration handled in-app.",
  },
  {
    icon: Wallet,
    title: "Pay per message, not per tier",
    text: "Top up credits and spend them at the destination country's rate. No allowance to overrun before a launch.",
  },
  {
    icon: LayoutTemplate,
    title: "The growth tools are included",
    text: "AI-built landing pages, consent-first sign-up forms, templates and automations come with the platform.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance built in",
    text: "Separate marketing and transactional consent, automatic STOP handling, permanent suppression and content screening.",
  },
];

export const Route = createFileRoute("/compare/")({
  head: () =>
    pageHead({
      path: "/compare",
      title: "Compare Xellvio to Other SMS Marketing Platforms",
      description:
        "See how Xellvio compares to Attentive, SimpleTexting, Textmagic, Textla, SlickText, Salesmsg, EZ Texting, Twilio and ClickSend on global delivery, automations, landing pages, forms and pricing.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Compare", path: "/compare" },
      ],
      schema: [faqSchema(FAQ)],
    }),
  component: CompareHub,
});

function CompareHub() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 pb-16 md:pt-20">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
              <span aria-hidden className="px-2">
                /
              </span>
              <span className="text-foreground">Compare</span>
            </nav>
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Why Xellvio
            </p>
            <h1 className="mt-5 max-w-3xl text-[42px] sm:text-5xl md:text-[60px] font-extrabold leading-[1.03] tracking-tight text-foreground">
              Compare Xellvio to other SMS platforms
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Honest, side-by-side comparisons of how Xellvio works against the SMS tools businesses
              usually shortlist — worldwide delivery, automations, list growth, reporting and how you
              pay.
            </p>
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
          </div>
        </section>

        <section className="bg-sand py-20">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <motion.h2
              {...reveal}
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground"
            >
              What tends to make the difference
            </motion.h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {REASONS.map((r, i) => (
                <motion.div
                  key={r.title}
                  {...reveal}
                  transition={{ ...reveal.transition, delay: i * 0.04 }}
                  className="rounded-2xl border border-border bg-card p-6"
                >
                  <r.icon className="size-5 text-coral" />
                  <h3 className="mt-4 text-base font-bold text-foreground">{r.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-background py-20">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <motion.h2
              {...reveal}
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground"
            >
              Xellvio vs the alternatives
            </motion.h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Pick a platform to see a full breakdown, including where the other tool may suit you
              better.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {COMPARISONS.map((c, i) => (
                <motion.div
                  key={c.slug}
                  {...reveal}
                  transition={{ ...reveal.transition, delay: i * 0.03 }}
                >
                  <Link
                    to="/compare/$slug"
                    params={{ slug: c.slug }}
                    className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {c.rivalCategory}
                    </span>
                    <h3 className="mt-3 text-xl font-bold text-foreground">
                      Xellvio vs {c.rival}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {c.heroBody}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      Read the comparison
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
            <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Comparisons describe each company's publicly stated positioning at the time of writing.
              Features and plans change — please check the other platform's own website before making
              a decision.
            </p>
          </div>
        </section>

        <ChannelFaq id="faq" items={FAQ} />
        <ChannelCta
          title="See it on your own numbers"
          body="Create a free account, get starter credits and send a real campaign before you move anything across."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
