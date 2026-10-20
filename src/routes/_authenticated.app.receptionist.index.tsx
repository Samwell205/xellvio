import { createFileRoute } from "@tanstack/react-router";
import { ReceptionistWorkspace, receptionistQuery } from "@/components/receptionist/ReceptionistWorkspace";
export const Route = createFileRoute("/_authenticated/app/receptionist/")({
  head: () => ({ meta: [{ title: "AI Receptionist setup — Xellvio" }, { name: "description", content: "Manage your business receptionist, phone setup, caller follow-ups and calendar." }, { property: "og:title", content: "AI Receptionist setup — Xellvio" }, { property: "og:description", content: "Manage your business receptionist, phone setup, caller follow-ups and calendar." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(receptionistQuery),
  component: () => <ReceptionistWorkspace view="setup"/>,
});