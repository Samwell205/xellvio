import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { adminListTickets, adminDuplicateTickets, adminMergeDuplicateTickets } from "@/lib/support-tickets.functions";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const Route = createFileRoute("/_authenticated/admin/tickets/")({
  head: () => ({ meta: [{ title: "Support tickets — Xellvio Admin" }, { name: 'description', content: 'Review customer requests and consolidate duplicate support conversations.' }, { property: 'og:title', content: 'Support tickets — Xellvio Admin' }, { property: 'og:description', content: 'Review customer requests and consolidate duplicate support conversations.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Tickets,
});

const TABS = [["open", "Open"], ["waiting", "Waiting on customer"], ["resolved", "Resolved"], ["closed", "Closed"]] as const;

function Tickets() {
  const [status, setStatus] = useState<(typeof TABS)[number][0]>("open");
  const listFn = useServerFn(adminListTickets);
  const duplicatesFn = useServerFn(adminDuplicateTickets);
  const mergeFn = useServerFn(adminMergeDuplicateTickets);
  const qc = useQueryClient();
  const [merging, setMerging] = useState(false);
  const duplicates = useQuery({ queryKey: ['admin-duplicate-tickets'], queryFn: () => duplicatesFn() });
  async function merge(sourceId: string, targetId: string) {
    if (!window.confirm('Combine these conversations, close the newer ticket and notify the customer? All messages and attachments will be retained.')) return;
    setMerging(true);
    try {
      await mergeFn({ data: { sourceId, targetId } });
      toast.success('Tickets combined');
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-tickets'] }), qc.invalidateQueries({ queryKey: ['admin-duplicate-tickets'] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not combine tickets'); }
    finally { setMerging(false); }
  }
  const q = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => listFn({ data: { status } }), refetchInterval: 60_000 });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Ticket className="size-6" /> Support tickets</h1>
        <p className="text-sm text-muted-foreground">Waiting tickets receive reminders at 3 and 6 hours and close at 9 hours without a reply.</p>
      </div>
      {(duplicates.data ?? []).map((d) => <div key={d.sourceId} className="flex items-center justify-between gap-3 border-b border-border py-3"><p className="text-sm">Duplicate conversations: #{d.sourceNumber} and #{d.targetNumber}</p><Button variant="outline" disabled={merging} onClick={() => merge(d.sourceId, d.targetId)}>Combine tickets</Button></div>)}
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <Button variant={status === k ? 'default' : 'outline'} key={k} onClick={() => setStatus(k)} className={cn("px-4 py-1.5 text-sm")}>
            {label} {q.data?.counts?.[k] != null && <span className="ml-1 opacity-70">{q.data.counts[k]}</span>}
          </Button>
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
