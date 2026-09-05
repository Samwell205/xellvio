import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta } from "@/components/marketing/ProductKit";
import { CategoryLinks, TemplateGrid } from "@/components/marketing/TemplateLibraryGrid";
import { GOAL_LABEL, MIN_COLLECTION_SIZE, isGoal, templatesByGoal } from "@/lib/templates/library";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/templates/use-case/$goal")({
  loader: ({ params }) => {
    if (!isGoal(params.goal)) throw notFound();
    if (templatesByGoal(params.goal).length < MIN_COLLECTION_SIZE) throw notFound();
  },
  head: ({ params }) => {
    if (!isGoal(params.goal)) {
      return { meta: [{ title: "Templates | Xellvio" }, { name: "robots", content: "noindex" }] };
    }
    const label = GOAL_LABEL[params.goal];
    const items = templatesByGoal(params.goal);
    const path = `/templates/use-case/${params.goal}`;
    return pageHead({
      path,
      title: `Templates to ${label.toLowerCase()}`,
      description: `${items.length} free Xellvio templates to ${label.toLowerCase()} — landing pages, sign-up forms and SMS automations you can preview here and publish from your workspace.`,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Templates", path: "/templates" },
        { name: label, path },
      ],
    });
  },
  component: GoalCollection,
});

function GoalCollection() {
  const { goal } = Route.useParams();
  const key = isGoal(goal) ? goal : "grow-a-list";
  const label = GOAL_LABEL[key];
  const items = templatesByGoal(key);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-border bg-sand">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 md:py-20">
            <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <span className="px-2">/</span>
              <Link to="/templates" className="hover:text-foreground">Templates</Link>
              <span className="px-2">/</span>
              <span className="text-foreground">{label}</span>
            </nav>
            <h1 className="mt-5 max-w-3xl text-4xl md:text-[52px] font-extrabold leading-[1.06] tracking-tight text-foreground">
              Templates to {label.toLowerCase()}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {items.length} templates built for one job: {label.toLowerCase()}. Preview any of them, then open it in your
              workspace as an editable draft.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16">
          <TemplateGrid items={items} />
          <div className="mt-14">
            <CategoryLinks />
          </div>
        </section>

        <ChannelCta
          title="Pick one and launch it this week"
          body="Create a free account and the template lands in your workspace, ready to edit and publish."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
