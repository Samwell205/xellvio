import { createFileRoute } from "@tanstack/react-router";
import { ReceptionistWorkspace, receptionistQuery } from "@/components/receptionist/ReceptionistWorkspace";
export const Route = createFileRoute("/_authenticated/app/receptionist/appointments")({
  head: () => ({ meta: [{ title: "Receptionist appointments — Xellvio" }, { name: "description", content: "Book and manage confirmed business appointments through your own calendar." }, { property: "og:title", content: "Receptionist appointments — Xellvio" }, { property: "og:description", content: "Book and manage confirmed business appointments through your own calendar." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(receptionistQuery), component: () => <ReceptionistWorkspace view="appointments"/>,
});