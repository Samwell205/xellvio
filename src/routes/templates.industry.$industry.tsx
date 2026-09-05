import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { ChannelCta } from "@/components/marketing/ProductKit";
import { CategoryLinks, TemplateGrid } from "@/components/marketing/TemplateLibraryGrid";
import {
  INDUSTRY_LABEL,
  MIN_COLLECTION_SIZE,
  isIndustry,
  templatesByIndustry,
} from "@/lib/templates/library";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/templates/industry/$industry")({
  loader: ({ params }) => {
    if (!isIndustry(params.industry)) throw notFound();
    // Thin collections stay off the site rather than becoming near-empty pages.
    if (templatesByIndustry(params.industry).length < MIN_COLLECTION_SIZE) throw notFound();
  },
  head: ({ params }) => {
    if (!isIndustry(params.industry)) {
      return { meta: [{ title: "Templates | Xellvio" }, { name: "robots", content: "noindex" }] };
    }
    const label = INDUSTRY_LABEL[params.industry];
    const items = templatesByIndustry(params.industry);
    const path = `/templates/industry/${params.industry}`;
    return pageHead({
      path,
      title: `${label} SMS and Landing Page Templates`,
      description: `${items.length} free Xellvio templates for ${label.toLowerCase()}: landing pages, sign-up forms and SMS automations you can preview, edit and publish.`,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Templates", path: "/templates" },
        { name: label, path },
      ],
    });
  },
  component: IndustryCollection,
});

function IndustryCollection() {
  const { industry } = Route.useParams();
  const key = isIndustry(industry) ? industry : "ecommerce";
  const label = INDUSTRY_LABEL[key];
  const items = templatesByIndustry(key);

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
              Templates for {label.toLowerCase()}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {items.length} templates chosen for {label.toLowerCase()} — pages and forms to collect the contact, and
              automations to follow up. Everything stays editable once it is in your workspace.
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
          title={`Launch your first ${label.toLowerCase()} template`}
          body="Create a free account and the template opens in your workspace, ready to edit."
          cta={{ label: "Start free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
