import { createFileRoute } from "@tanstack/react-router";
import { ReceptionistWorkspace, receptionistQuery } from "@/components/receptionist/ReceptionistWorkspace";
export const Route = createFileRoute("/_authenticated/admin/receptionist")({
  head: () => ({ meta: [{ title:"Receptionist pilot setup — Xellvio Admin" },{name:"description",content:"Configure and verify the owner’s receptionist pilot before tenant rollout."},{property:"og:title",content:"Receptionist pilot setup — Xellvio Admin"},{property:"og:description",content:"Configure and verify the owner’s receptionist pilot before tenant rollout."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(receptionistQuery), component: () => <ReceptionistWorkspace view="setup"/>,
});