import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicLandingPage, submitSubscribe } from "@/lib/public-growth.functions";
import { PageRenderer } from "@/components/website/renderers";
import { blankSection, mergeDesign, parseSections, type Section } from "@/lib/website-design";
import { BlockCanvas } from "@/components/builder/BlockRenderer";
import { mergeTheme, normalizeBlocks } from "@/lib/builder/schema";

const DEFAULT_CONSENT =
  "By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const page = await getPublicLandingPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ params, loaderData }) => {
    const d = (loaderData ?? {}) as any;
    const title = (d.seo_title || d.headline || d.name || "Sign up").slice(0, 70);
    const description = (d.seo_description || d.subheadline || d.body || "Join our text list.").slice(0, 155);
    const url = `https://xellvio.com/p/${params.slug}`;
    const image: string | null = typeof d.og_image_url === "string" && d.og_image_url.startsWith("https://") ? d.og_image_url : null;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: LandingPageView,
});

function LandingPageView() {
  const page = Route.useLoaderData() as any;
  const design = mergeDesign(page.design);
  const blocks = normalizeBlocks(page.blocks);
  if (blocks.length > 0) {
    return (
      <main style={{ minHeight: "100vh" }}>
        <BlockCanvas
          blocks={blocks}
          theme={mergeTheme(page.builder_theme)}
          interactive
          onSubmit={async ({ phone, firstName, lastName }) => {
            const r = await submitSubscribe({
              data: {
                sourceType: "landing_page",
                slug: page.slug,
                phone,
                firstName: firstName || null,
                lastName: lastName || null,
              },
            });
            return r.message;
          }}
        />
      </main>
    );
  }
  let sections: Section[] = parseSections(page.sections);

  if (sections.length === 0) {
    const hero = blankSection("hero");
    sections = [
      { ...hero, headline: page.headline || page.name, subheadline: page.subheadline || "", body: page.body || "", imageUrl: page.image_url || "" } as Section,
    ];
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <PageRenderer
        design={design}
        sections={sections}
        logoUrl={page.logo_url || null}
        form={{
          ctaLabel: page.cta_label || "Sign up",
          successMessage: page.success_message || "Thanks — you are subscribed!",
          consentText: page.consent_text || DEFAULT_CONSENT,
          collectName: true,
        }}
        onSubmit={async ({ phone, firstName, lastName }) => {
          const r = await submitSubscribe({
            data: {
              sourceType: "landing_page",
              slug: page.slug,
              phone,
              firstName: firstName || null,
              lastName: lastName || null,
            },
          });
          return r.message;
        }}
      />
    </main>
  );
}
