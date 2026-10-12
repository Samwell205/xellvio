import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LifeBuoy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/support/TicketThread";
import { createMyTicket, listMyTickets } from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/_authenticated/app/support/")({
  head: () => ({ meta: [{ title: "Support tickets — Xellvio" }, { name: "description", content: "Open and track your Xellvio support tickets." }] }),
  component: SupportList,
});

function SupportList() {
  const listFn = useServerFn(listMyTickets);
  const createFn = useServerFn(createMyTicket);
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["my-tickets"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><LifeBuoy className="size-6" /> Support</h1>
          <p className="text-sm text-muted-foreground">Open a ticket and our team will reply here and by email.</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}><Plus className="size-4" /> New ticket</Button>
      </div>
      {open && (
        <Card className="space-y-3 p-5">
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea rows={5} placeholder="Describe the issue — include campaign names, numbers or error messages." value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end">
            <Button disabled={busy || subject.trim().length < 3 || !body.trim()} onClick={async () => {
              setBusy(true);
              try { const r = await createFn({ data: { subject, body } }); toast.success("Ticket opened"); nav({ to: "/app/support/$id", params: { id: r.id } }); }
              catch (e: any) { toast.error(e?.message ?? "Could not open ticket"); } finally { setBusy(false); }
            }}>{busy && <Loader2 className="size-4 animate-spin" />} Open ticket</Button>
          </div>
        </Card>
      )}
      <div className="space-y-2">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!q.isLoading && !q.data?.length && <Card className="p-8 text-center text-muted-foreground">No tickets yet.</Card>}
        {(q.data ?? []).map((t: any) => (
          <Link key={t.id} to="/app/support/$id" params={{ id: t.id }}>
            <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-primary/40">
              <div className="min-w-0"><div className="text-xs text-muted-foreground">#{t.number} · {new Date(t.updated_at).toLocaleString()}</div><div className="truncate font-medium">{t.subject}</div></div>
              <StatusBadge status={t.status} />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
