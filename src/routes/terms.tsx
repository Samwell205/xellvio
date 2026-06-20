import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/content/legal";

const doc = LEGAL_DOCS.terms;

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `${doc.title} — Xellvio` },
      { name: "description", content: doc.description },
      { property: "og:title", content: `${doc.title} — Xellvio` },
      { property: "og:description", content: doc.description },
    ],
  }),
  component: () => <LegalPage doc={doc} />,
});
