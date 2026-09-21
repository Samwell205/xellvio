import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/content/legal";
import { pageHead } from "@/lib/seo";

const doc = LEGAL_DOCS.refunds;

export const Route = createFileRoute("/refunds")({
  head: () =>
    pageHead({
      path: "/refunds",
      title: `${doc.title} — Xellvio`,
      description: doc.description,
    }),
  component: () => <LegalPage doc={doc} />,
});
