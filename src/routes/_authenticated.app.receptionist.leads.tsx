import { createFileRoute } from "@tanstack/react-router";
import { ReceptionistWorkspace, receptionistQuery } from "@/components/receptionist/ReceptionistWorkspace";
export const Route = createFileRoute("/_authenticated/app/receptionist/leads")({
  head: () => ({ meta: [{ title: "Receptionist leads — Xellvio" }, { name: "description", content: "Manage caller requests, captured contact details and SMS permission." }, { property: "og:title", content: "Receptionist leads — Xellvio" }, { property: "og:description", content: "Manage caller requests, captured contact details and SMS permission." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(receptionistQuery), component: () => <ReceptionistWorkspace view="leads"/>,
});