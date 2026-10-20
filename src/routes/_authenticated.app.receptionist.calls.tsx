import { createFileRoute } from "@tanstack/react-router";
import { ReceptionistWorkspace, receptionistQuery } from "@/components/receptionist/ReceptionistWorkspace";
export const Route = createFileRoute("/_authenticated/app/receptionist/calls")({
  head: () => ({ meta: [{ title: "Receptionist calls — Xellvio" }, { name: "description", content: "Review business call history, summaries and answering status." }, { property: "og:title", content: "Receptionist calls — Xellvio" }, { property: "og:description", content: "Review business call history, summaries and answering status." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(receptionistQuery), component: () => <ReceptionistWorkspace view="calls"/>,
});