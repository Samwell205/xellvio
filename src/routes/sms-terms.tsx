import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/content/legal";
import { pageHead } from "@/lib/seo";

const doc = LEGAL_DOCS["sms-terms"];

export const Route = createFileRoute("/sms-terms")({
  head: () =>
    pageHead({
      path: "/sms-terms",
      title: `${doc.title} — Xellvio`,
      description: doc.description,
    }),
  component: () => <LegalPage doc={doc} />,
});
