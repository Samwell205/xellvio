import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { adminListTickets } from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/_authenticated/admin/tickets/")({
  head: () => ({ meta: [{ title: "Support tickets — Admin" }] }),
  component: Tickets,
});

const TABS = [["open", "Open"], ["waiting", "Waiting on customer"], ["closed", "Closed"]] as const;

function Tickets() {
  const [status, setStatus] = useState<(typeof TABS)[number][0]>("open");
  const listFn = useServerFn(adminListTickets);
  const q = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => listFn({ data: { status } }), refetchInterval: 60_000 });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Ticket className="size-6" /> Support tickets</h1>
        <p className="text-sm text-muted-foreground">Contact form, in-app and email requests. Waiting tickets get a reminder after 24h and close after 72h without a reply.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={cn("rounded-full border px-4 py-1.5 text-sm", status === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>
            {label} {q.data?.counts?.[k] != null && <span className="ml-1 opacity-70">{q.data.counts[k]}</span>}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!q.isLoading && !q.data?.rows.length && <Card className="p-8 text-center text-muted-foreground">No tickets here.</Card>}
        {(q.data?.rows ?? []).map((t: any) => (
          <Link key={t.id} to="/admin/tickets/$id" params={{ id: t.id }}>
            <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-primary/40">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">#{t.number} · {t.requester_name ? `${t.requester_name} · ` : ""}{t.requester_email}{t.account_id ? " · tenant" : ""}</div>
                <div className="truncate font-medium">{t.subject}</div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleString()}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
