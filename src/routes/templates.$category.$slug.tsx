import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { BlockCanvas } from "@/components/builder/BlockRenderer";
import { AUTOMATION_TEMPLATES } from "@/lib/automation-templates";
import { CATEGORY_META, previewFor, isTemplateCategory } from "@/lib/marketing/template-catalog";
import {
  COMPLEXITY_LABEL,
  GOAL_LABEL,
  INDUSTRY_LABEL,
  authPath,
  findLibraryTemplate,
  relatedTemplates,
} from "@/lib/templates/library";
import { recordTemplateEvent } from "@/lib/template-import.functions";
import { pageHead, faqSchema } from "@/lib/seo";

export const Route = createFileRoute("/templates/$category/$slug")({
  loader: ({ params }) => {
    if (!isTemplateCategory(params.category)) throw notFound();
    if (!findLibraryTemplate(params.category, params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const template = findLibraryTemplate(params.category, params.slug);
    if (!template) {
      return { meta: [{ title: "Template unavailable | Xellvio" }, { name: "robots", content: "noindex" }] };
    }
    const meta = CATEGORY_META[template.category as keyof typeof CATEGORY_META];
    const path = `${meta.path}/${template.slug}`;
    const noun =
      template.type === "automation" ? "automation" : template.type === "signup-form" ? "sign-up form" : "landing page";
    return pageHead({
      path,
      title: `${template.label} ${noun} template`,
      description: `${template.blurb} Preview the ${template.label.toLowerCase()} ${noun} template free, then edit and publish it in Xellvio.`,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Templates", path: "/templates" },
        { name: meta.label, path: meta.path },
        { name: template.label, path },
      ],
      schema: [faqSchema(template.faq)],
    });
  },
  component: TemplateDetail,
});

function TemplateDetail() {
  const params = Route.useParams();
  const category = isTemplateCategory(params.category) ? params.category : "landing-pages";
  const slug = params.slug;
  const template = findLibraryTemplate(category, slug)!;
  const meta = CATEGORY_META[category];
  const preview = previewFor(category, slug);
  const automation = category === "automations" ? AUTOMATION_TEMPLATES.find((a) => a.id === slug) : undefined;
  const related = relatedTemplates(template, 3);
  const track = useServerFn(recordTemplateEvent);
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void track({ data: { category, slug, event: "view", referrer: document.referrer?.slice(0, 300) || null } }).catch(
      () => undefined,
    );
  }, [category, slug, track]);

  const onUseClick = () => {
    void track({ data: { category, slug, event: "use_click" } }).catch(() => undefined);
  };

  const facts = [
    { label: "Best for", value: template.goals.map((g) => GOAL_LABEL[g]).join(", ") },
    { label: "Industries", value: template.industries.map((i) => INDUSTRY_LABEL[i]).join(", ") },
    { label: "Level", value: COMPLEXITY_LABEL[template.complexity] },
    { label: "Version", value: template.version },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-sand">
          <div className="mx-auto grid max-w-[1400px] gap-10 px-5 sm:px-8 py-12 md:py-16 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
                <Link to="/templates" className="hover:text-foreground">Templates</Link>
                <span className="px-2">/</span>
                <Link to={meta.path} className="hover:text-foreground">{meta.label}</Link>
              </nav>
              <span className="mt-5 inline-block rounded-full bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {template.tag}
              </span>
              <h1 className="mt-4 text-4xl md:text-[50px] font-extrabold leading-[1.06] tracking-tight text-foreground">
                {template.label}
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{template.answer}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Who it's for:</span> {template.audience}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to={authPath(template).to}
                  search={authPath(template).search}
                  onClick={onUseClick}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
                >
                  Use this template <ArrowRight className="size-4" />
                </Link>
                <Link
                  to={meta.product}
                  className="inline-flex items-center rounded-full border border-foreground/25 px-6 py-3 font-semibold text-foreground hover:bg-muted"
                >
                  How it works
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Free to use. Sign in or create an account and the template is copied straight into your workspace as an
                editable draft.
              </p>

              <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-3xl border border-border bg-card p-4">
              <p className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Live preview
              </p>
              <div className="max-h-[520px] overflow-hidden rounded-2xl border border-border">
                {preview ? (
                  <div className="origin-top scale-[0.92]">
                    <BlockCanvas blocks={preview.blocks} theme={preview.theme} />
                  </div>
                ) : automation ? (
                  <ol className="divide-y divide-border">
                    {automation.nodes.map((n, i) => (
                      <li key={n.key} className="flex items-center gap-3 px-5 py-4 text-sm">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                          {i + 1}
                        </span>
                        <span className="text-foreground">{stepLabel(n.type)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] grid gap-12 px-5 sm:px-8 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">What's inside</h2>
            <ul className="mt-6 space-y-4">
              {template.features.map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-coral" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">How to customise it</h2>
            <ul className="mt-6 space-y-4">
              {template.customise.map((c) => (
                <li key={c} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-coral" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border bg-card/40 py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">How this template works</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-4">
              {template.steps.map((s, i) => (
                <li key={s} className="rounded-2xl border border-border bg-background p-6">
                  <span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-bold text-ink-foreground">
                    {i + 1}
                  </span>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{s}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[900px] px-5 sm:px-8 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Questions about this template</h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {template.faq.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="text-base font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-border bg-sand py-16">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Templates that pair with this</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {related.map((t) => (
                <Link
                  key={`${t.category}-${t.slug}`}
                  to="/templates/$category/$slug"
                  params={{ category: t.category, slug: t.slug }}
                  className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_META[t.category as keyof typeof CATEGORY_META].label.replace(" templates", "")}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-foreground">{t.label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    View <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              Browse more{" "}
              {template.goals[0] ? (
                <Link
                  to="/templates/use-case/$goal"
                  params={{ goal: template.goals[0] }}
                  className="font-semibold text-foreground underline"
                >
                  templates to {GOAL_LABEL[template.goals[0]].toLowerCase()}
                </Link>
              ) : null}
              {template.industries[0] ? (
                <>
                  {" "}or see what{" "}
                  <Link
                    to="/templates/industry/$industry"
                    params={{ industry: template.industries[0] }}
                    className="font-semibold text-foreground underline"
                  >
                    {INDUSTRY_LABEL[template.industries[0]].toLowerCase()} teams
                  </Link>{" "}
                  start with
                </>
              ) : null}
              , then use{" "}
              <Link to="/reporting" className="font-semibold text-foreground underline">
                reporting
              </Link>{" "}
              to see what it produces.
            </p>
          </div>
        </section>

        <section className="bg-background py-20">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <div className="rounded-[32px] bg-ink px-8 py-14 md:px-16">
              <h2 className="max-w-2xl text-3xl md:text-4xl font-extrabold leading-tight tracking-tight text-ink-foreground">
                Use the {template.label.toLowerCase()} template in Xellvio
              </h2>
              <p className="mt-4 max-w-xl text-ink-foreground/70">
                Create your free account and the template lands in your workspace, ready to edit and publish.
              </p>
              <Link
                to={authPath(template).to}
                search={authPath(template).search}
                onClick={onUseClick}
                className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-lime px-6 py-3 font-semibold text-lime-foreground"
              >
                Use this template <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function stepLabel(type: string) {
  const map: Record<string, string> = {
    "trigger.contact_added": "Trigger: contact added",
    "trigger.keyword": "Trigger: keyword received",
    "trigger.link_click": "Trigger: link clicked",
    "trigger.tag_added": "Trigger: tag added",
    "trigger.date": "Trigger: date reached",
    "trigger.list_join": "Trigger: joined a list",
    "logic.check_consent": "Check messaging consent",
    "logic.clicked_link": "Condition: clicked a link",
    "logic.exit": "Exit the journey",
    "action.send_sms": "Send SMS",
    "action.add_tag": "Add a tag",
    "action.remove_tag": "Remove a tag",
    "action.add_to_list": "Add to a list",
    "action.webhook": "Call a webhook",
    "timing.wait": "Wait",
  };
  return map[type] ?? type.replace(/^[a-z]+\./, "").replace(/_/g, " ");
}
