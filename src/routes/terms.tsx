import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/content/legal";
import { pageHead } from "@/lib/seo";

const doc = LEGAL_DOCS.terms;

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      path: "/terms",
      title: `${doc.title} — Xellvio`,
      description: doc.description,
    }),
  component: () => <LegalPage doc={doc} />,
});
