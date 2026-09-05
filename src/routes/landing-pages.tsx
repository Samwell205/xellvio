import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/components/marketing/ProductPage";
import { PRODUCT_PAGES } from "@/components/marketing/product-pages";
import { pageHead, faqSchema, softwareApplicationSchema } from "@/lib/seo";

const def = PRODUCT_PAGES["landing-pages"]!;

export const Route = createFileRoute("/landing-pages")({
  head: () =>
    pageHead({
      path: def.path,
      title: def.seoTitle,
      description: def.seoDescription,
      keywords: def.keywords,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: def.seoTitle, path: def.path },
      ],
      schema: [
        faqSchema(def.faq),
        softwareApplicationSchema({
          name: `Xellvio ${def.eyebrow.replace(/^Xellvio /, "")}`,
          description: def.seoDescription,
          path: def.path,
          featureList: def.features.map((f) => f.title),
        }),
      ],
    }),
  component: () => <ProductPage def={def} />,
});
