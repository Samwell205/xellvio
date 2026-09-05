import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/components/marketing/ProductPage";
import { PRODUCT_PAGES } from "@/components/marketing/product-pages";
import { pageHead, faqSchema, softwareApplicationSchema } from "@/lib/seo";

export const Route = createFileRoute("/reporting")({
  head: () => {
    const def = PRODUCT_PAGES["reporting"]!;
    return pageHead({
      path: def.path,
      title: def.seoTitle,
      description: def.seoDescription,
      keywords: def.keywords,
      schema: [
        faqSchema(def.faq),
        softwareApplicationSchema({
          name: `Xellvio ${def.eyebrow.replace(/^Xellvio /, "")}`,
          description: def.seoDescription,
          path: def.path,
          featureList: def.features.map((f) => f.title),
        }),
      ],
    });
  },
  component: ReportingPage,
});

function ReportingPage() {
  return <ProductPage def={PRODUCT_PAGES["reporting"]!} />;
}
