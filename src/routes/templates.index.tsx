import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LayoutTemplate, FormInput, Workflow } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta } from "@/components/marketing/ProductKit";
import { CATEGORY_META, templatesInCategory, type TemplateCategory } from "@/lib/marketing/template-catalog";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/templates/")({
  head: () =>
    pageHead({
      path: "/templates",
      title: "Templates for Landing Pages, Forms and Automations",
      description:
        "Browse Xellvio templates: 12 landing pages, 10 sign-up forms and 10 SMS automations you can preview here and edit inside Xellvio. Every template is ready to publish or activate.",
      keywords: ["landing page templates", "sign up form templates", "sms automation templates"],
    }),
  component: TemplatesHub,
});

const ICONS: Record<TemplateCategory, typeof LayoutTemplate> = {
  "landing-pages": LayoutTemplate,
  "sign-up-forms": FormInput,
  automations: Workflow,
};

function TemplatesHub() {
  const categories = Object.keys(CATEGORY_META) as TemplateCategory[];
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
              Every template below ships inside Xellvio. Preview it here, then open it in the builder, change
              the copy and colours, and publish or activate it on your own account.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16">
          <div className="grid gap-6 md:grid-cols-3">
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
