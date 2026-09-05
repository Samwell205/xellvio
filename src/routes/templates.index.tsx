import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LayoutTemplate, FormInput, Workflow, Search } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta } from "@/components/marketing/ProductKit";
import { TemplateGrid } from "@/components/marketing/TemplateLibraryGrid";
import { CATEGORY_META, templatesInCategory, type TemplateCategory } from "@/lib/marketing/template-catalog";
import {
  COMPLEXITY_LABEL,
  GOAL_LABEL,
  INDUSTRY_LABEL,
  MIN_COLLECTION_SIZE,
  TEMPLATE_LIBRARY,
  filterTemplates,
  isGoal,
  isIndustry,
  templatesByGoal,
  templatesByIndustry,
  type Complexity,
  type Goal,
  type Industry,
  type TemplateType,
} from "@/lib/templates/library";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Search = {
  q?: string;
  type?: TemplateType | "all";
  industry?: Industry | "all";
  goal?: Goal | "all";
  level?: Complexity | "all";
};

const TYPES: { value: TemplateType | "all"; label: string }[] = [
  { value: "all", label: "All templates" },
  { value: "landing-page", label: "Landing pages" },
  { value: "signup-form", label: "Sign-up forms" },
  { value: "automation", label: "Automations" },
];

export const Route = createFileRoute("/templates/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === "string" ? search.q.slice(0, 60) : undefined,
    type: TYPES.some((t) => t.value === search.type) ? (search.type as TemplateType | "all") : undefined,
    industry: typeof search.industry === "string" && isIndustry(search.industry) ? search.industry : undefined,
    goal: typeof search.goal === "string" && isGoal(search.goal) ? search.goal : undefined,
    level:
      search.level === "starter" || search.level === "intermediate" || search.level === "advanced"
        ? search.level
        : undefined,
  }),
  head: () =>
    pageHead({
      path: "/templates",
      title: "Free SMS, Landing Page and Form Templates",
      description: `Browse ${TEMPLATE_LIBRARY.length} free Xellvio templates: landing pages, sign-up forms and SMS automations. Preview any template, then open it in your workspace and publish it.`,
      keywords: ["sms templates", "landing page templates", "sign up form templates", "sms automation templates"],
    }),
  component: TemplatesHub,
});

const ICONS: Record<TemplateCategory, typeof LayoutTemplate> = {
  "landing-pages": LayoutTemplate,
  "sign-up-forms": FormInput,
  automations: Workflow,
};

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-foreground bg-ink text-ink-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TemplatesHub() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/templates/" });
  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });

  const filters = {
    q: search.q,
    type: search.type ?? "all",
    industry: search.industry ?? "all",
    goal: search.goal ?? "all",
    complexity: search.level ?? "all",
  };
  const results = filterTemplates(filters);
  const filtering = Boolean(search.q || search.type || search.industry || search.goal || search.level);
  const featured = TEMPLATE_LIBRARY.filter((t) => t.featured);
  const categories = Object.keys(CATEGORY_META) as TemplateCategory[];
  const industries = (Object.keys(INDUSTRY_LABEL) as Industry[]).filter(
    (i) => templatesByIndustry(i).length >= MIN_COLLECTION_SIZE,
  );
  const goals = (Object.keys(GOAL_LABEL) as Goal[]).filter((g) => templatesByGoal(g).length >= MIN_COLLECTION_SIZE);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-sand">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16 md:py-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Templates</p>
            <h1 className="mt-5 max-w-3xl text-[40px] sm:text-5xl md:text-[58px] font-extrabold leading-[1.05] tracking-tight text-foreground">
              Start from something that already works
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {TEMPLATE_LIBRARY.length} free templates that ship inside Xellvio. Preview one here, then open it in your
              workspace — it arrives as an editable draft, not a locked design.
            </p>

            <div className="mt-9 max-w-xl">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search.q ?? ""}
                  onChange={(e) => set({ q: e.target.value || undefined })}
                  placeholder="Search templates — webinar, discount, win-back…"
                  className="w-full rounded-full border border-border bg-card py-3.5 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                  aria-label="Search templates"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-12">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Chip
                  key={t.value}
                  active={filters.type === t.value}
                  onClick={() => set({ type: t.value === "all" ? undefined : t.value })}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {goals.map((g) => (
                <Chip key={g} active={filters.goal === g} onClick={() => set({ goal: filters.goal === g ? undefined : g })}>
                  {GOAL_LABEL[g]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {industries.map((i) => (
                <Chip
                  key={i}
                  active={filters.industry === i}
                  onClick={() => set({ industry: filters.industry === i ? undefined : i })}
                >
                  {INDUSTRY_LABEL[i]}
                </Chip>
              ))}
              {(Object.keys(COMPLEXITY_LABEL) as Complexity[]).map((c) => (
                <Chip
                  key={c}
                  active={filters.complexity === c}
                  onClick={() => set({ level: filters.complexity === c ? undefined : c })}
                >
                  {COMPLEXITY_LABEL[c]}
                </Chip>
              ))}
              {filtering && (
                <button
                  type="button"
                  onClick={() =>
                    navigate({ search: {}, replace: true, resetScroll: false })
                  }
                  className="rounded-full px-4 py-2 text-sm font-semibold text-foreground underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {!filtering && (
            <div className="mt-14">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Most-used templates</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The ones teams open first when they start a list, fill an event or follow up on leads.
              </p>
              <div className="mt-7">
                <TemplateGrid items={featured} />
              </div>
            </div>
          )}

          <div className="mt-14">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
              {filtering ? `${results.length} template${results.length === 1 ? "" : "s"}` : "Every template"}
            </h2>
            <div className="mt-7">
              <TemplateGrid items={results} />
            </div>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {categories.map((c) => {
              const meta = CATEGORY_META[c];
              const Icon = ICONS[c];
              const count = templatesInCategory(c).length;
              return (
                <Link
                  key={c}
                  to={meta.path}
                  className="group flex flex-col rounded-3xl border border-border bg-card p-8 transition-colors hover:border-foreground/30"
                >
                  <Icon className="size-7 text-coral" strokeWidth={1.6} />
                  <h2 className="mt-5 text-xl font-bold text-foreground">{meta.label}</h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{meta.intro}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    See {count} templates{" "}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-14 grid gap-8 rounded-3xl border border-border bg-muted/40 p-8 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold text-foreground">Browse by industry</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {industries.map((i) => (
                  <Link
                    key={i}
                    to="/templates/industry/$industry"
                    params={{ industry: i }}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-foreground/40"
                  >
                    {INDUSTRY_LABEL[i]}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Browse by goal</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {goals.map((g) => (
                  <Link
                    key={g}
                    to="/templates/use-case/$goal"
                    params={{ goal: g }}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-foreground/40"
                  >
                    {GOAL_LABEL[g]}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-14 rounded-3xl border border-border bg-muted/40 p-8">
            <h2 className="text-xl font-bold text-foreground">How templates fit together</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              A <Link to="/signup-forms" className="font-semibold text-foreground underline">sign-up form</Link> or{" "}
              <Link to="/landing-pages" className="font-semibold text-foreground underline">landing page</Link> collects the
              contact, an{" "}
              <Link to="/automations" className="font-semibold text-foreground underline">automation</Link> follows up, your{" "}
              <Link to="/sms-marketing" className="font-semibold text-foreground underline">SMS campaigns</Link> keep the
              relationship going, and{" "}
              <Link to="/reporting" className="font-semibold text-foreground underline">reporting</Link> shows what each one
              earned. Pick one template from each category and you have a working programme.
            </p>
          </div>
        </section>

        <ChannelCta
          title="Use any template on a free account"
          body="Create an account, open the template in the builder and make it yours in minutes."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
