import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/content/legal";
import { pageHead } from "@/lib/seo";

const doc = LEGAL_DOCS.dpa;

export const Route = createFileRoute("/dpa")({
  head: () =>
    pageHead({
      path: "/dpa",
      title: `${doc.title} — Xellvio`,
      description: doc.description,
    }),
  component: () => <LegalPage doc={doc} />,
});
