import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AutomationBuilder } from "@/components/automation/AutomationBuilder";
import { getAutomation } from "@/lib/automations.functions";
import { listAudienceContactLists, listAudienceProfiles } from "@/lib/audience.functions";
import { getMySenderAssets } from "@/lib/sender-setup.functions";

export const Route = createFileRoute("/_authenticated/app/automations/$id")({
  head: () => ({
    meta: [
      { title: "Automation builder — Xellvio" },
      {
        name: "description",
        content: "Drag, connect and configure every step of your automation on an infinite canvas.",
      },
      { property: "og:title", content: "Automation builder — Xellvio" },
      {
        property: "og:description",
        content: "Drag, connect and configure every step of your automation on an infinite canvas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuilderPage,
});

function BuilderPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getAutomation);
  const getLists = useServerFn(listAudienceContactLists);
  const getProfiles = useServerFn(listAudienceProfiles);
  const getSenders = useServerFn(getMySenderAssets);

  const automationQuery = useQuery({
    queryKey: ["automation", id],
    queryFn: () => get({ data: { id } }),
    refetchOnWindowFocus: false,
  });
  const listsQuery = useQuery({
    queryKey: ["audience-lists"],
    queryFn: () => getLists(),
    staleTime: 60_000,
  });
  const sendersQuery = useQuery({
    queryKey: ["my-senders"],
    queryFn: () => getSenders(),
    staleTime: 60_000,
  });
  const contactsQuery = useQuery({
    queryKey: ["audience-profiles", "builder"],
    queryFn: () => getProfiles({ data: {} }),
    staleTime: 60_000,
  });

  if (automationQuery.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening builder…
      </div>
    );
  }
  if (automationQuery.error || !automationQuery.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">We could not open that automation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {(automationQuery.error as Error | null)?.message ?? "It may have been deleted."}
        </p>
      </div>
    );
  }

  const lists = ((listsQuery.data ?? []) as { id: string; name: string }[]).map((l) => ({
    id: l.id,
    name: l.name,
  }));
  const senders = (
    (sendersQuery.data ?? []) as { phone_number: string | null; country_code: string }[]
  )
    .filter((s) => !!s.phone_number)
    .map((s) => ({
      value: s.phone_number as string,
      label: `${s.phone_number} (${s.country_code})`,
    }));
  const contacts = ((contactsQuery.data ?? []) as any[]).slice(0, 100).map((p) => ({
    id: String(p.id),
    phone: String(p.phone_e164 ?? ""),
    label:
      [p.first_name, p.last_name].filter(Boolean).join(" ") || String(p.phone_e164 ?? "Contact"),
  }));

  return (
    <AutomationBuilder
      automation={automationQuery.data}
      lists={lists}
      senders={senders}
      contacts={contacts}
    />
  );
}
