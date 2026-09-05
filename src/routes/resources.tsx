import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, LayoutTemplate, LifeBuoy, Building2, Wallet, MessageSquare } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta } from "@/components/marketing/ProductKit";
import { INDUSTRIES } from "@/components/marketing/industries";
import { CATEGORY_META, templatesInCategory, type TemplateCategory } from "@/lib/marketing/template-catalog";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/resources")({
  head: () =>
    pageHead({
      path: "/resources",
      title: "Resources: Guides, Templates and Documentation",
      description:
        "The Xellvio resource hub: product documentation, ready-made templates for pages, forms and automations, industry solutions, and practical guides for getting more from SMS.",
      keywords: ["sms marketing resources", "sms guides", "messaging documentation"],
    }),
  component: ResourcesPage,
});

const GUIDES = [
  {
    title: "How to build an SMS list you're allowed to text",
    text: "Where consent comes from, what to record, and how a sign-up form or landing page captures it in one submission.",
    steps: [
      { label: "Sign-up forms", to: "/signup-forms" },
      { label: "Compliance", to: "/compliance" },
      { label: "Newsletter form template", to: "/templates/sign-up-forms/newsletter" },
    ],
  },
  {
    title: "How to create an SMS welcome sequence",
    text: "Trigger on the sign-up, greet immediately, wait, then send the first offer — and branch on whether the link was clicked.",
    steps: [
      { label: "Automations", to: "/automations" },
      { label: "Welcome series template", to: "/templates/automations/welcome-series" },
      { label: "Reporting", to: "/reporting" },
    ],
  },
  {
    title: "How to send to a new country without getting filtered",
    text: "Which markets accept sender IDs, when toll-free or 10DLC registration is required, and how Xellvio arranges it.",
    steps: [
      { label: "Global delivery", to: "/global-delivery" },
      { label: "Per-country pricing", to: "/pricing" },
      { label: "Compliance", to: "/compliance" },
    ],
  },
  {
    title: "How to read a campaign report properly",
    text: "The difference between sent, delivered and not delivered, where clicks come from, and how spend is calculated.",
    steps: [
      { label: "Reporting", to: "/reporting" },
      { label: "Audiences & segments", to: "/audiences" },
      { label: "SMS marketing", to: "/sms-marketing" },
    ],
  },
];

function ResourcesPage() {
  const categories = Object.keys(CATEGORY_META) as TemplateCategory[];
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-sand">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16 md:py-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Resources</p>
            <h1 className="mt-5 max-w-3xl text-[40px] sm:text-5xl md:text-[58px] font-extrabold leading-[1.05] tracking-tight text-foreground">
              Everything you need to run messaging well
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Documentation, templates, industry solutions and practical guides — each one links to the part of
              Xellvio that does the work.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Start here</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <HubCard icon={BookOpen} title="Documentation" text="How sending, senders, imports and reporting work." to="/docs" />
            <HubCard icon={LayoutTemplate} title="Templates" text="Pages, forms and automations ready to use." to="/templates" />
            <HubCard icon={Building2} title="Industry solutions" text="How Xellvio is used in your sector." to="/solutions" />
            <HubCard icon={LifeBuoy} title="Contact support" text="Talk to a human about your setup." to="/contact" />
          </div>
        </section>

        <section className="border-y border-border bg-background py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Guides</h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Each guide follows the same path: understand the idea, see the product page, then use the template.
            </p>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {GUIDES.map((g) => (
                <article key={g.title} className="rounded-2xl border border-border bg-card p-7">
                  <h3 className="text-lg font-bold text-foreground">{g.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{g.text}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {g.steps.map((s) => (
                      <Link
                        key={s.to + s.label}
                        to={s.to}
                        className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Templates by type</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c}
                to={CATEGORY_META[c].path}
                className="group rounded-2xl border border-border bg-card p-7 transition-colors hover:border-foreground/30"
              >
                <h3 className="text-lg font-bold text-foreground">{CATEGORY_META[c].label}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{CATEGORY_META[c].intro}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {templatesInCategory(c).length} templates{" "}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-sand py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Solutions by industry</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              {INDUSTRIES.map((i) => (
                <Link
                  key={i.slug}
                  to="/solutions/$industry"
                  params={{ industry: i.slug }}
                  className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:border-foreground/30"
                >
                  {i.name}
                </Link>
              ))}
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              <HubCard icon={Wallet} title="Earn as a verifier" text="Get paid to verify numbers with Xellvio." to="/verify" />
              <HubCard icon={MessageSquare} title="Email to SMS" text="Send a text straight from your inbox." to="/solutions/email-to-sms" />
            </div>
          </div>
        </section>

        <ChannelCta
          title="Put a guide into practice"
          body="Create a free account, pick a template and send your first campaign today."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

function HubCard({
  icon: Icon,
  title,
  text,
  to,
}: {
  icon: typeof BookOpen;
  title: string;
  text: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
    >
      <Icon className="size-6 text-coral" strokeWidth={1.6} />
      <h3 className="mt-4 text-base font-bold text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
