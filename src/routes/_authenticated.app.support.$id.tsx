import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { ReplyBox, ResolutionCard, StatusBadge, TicketThread } from "@/components/support/TicketThread";
import { confirmMyTicketResolved, getMyTicket, reopenMyResolvedTicket, replyMyTicket } from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/_authenticated/app/support/$id")({
  head: () => ({ meta: [{ title: "Support ticket — Xellvio" }, { name: "description", content: "Your Xellvio support ticket conversation." }] }),
  component: MyTicket,
});

function MyTicket() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyTicket);
  const replyFn = useServerFn(replyMyTicket);
  const confirmFn = useServerFn(confirmMyTicketResolved);
  const reopenFn = useServerFn(reopenMyResolvedTicket);
  const q = useQuery({ queryKey: ["my-ticket", id], queryFn: () => getFn({ data: { id } }) });
  const t = q.data?.ticket;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link to="/app/support" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All tickets</Link>
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : !t ? <Card className="p-8 text-center">Ticket not found.</Card> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm text-muted-foreground">Ticket #{t.number}</p><h1 className="text-2xl font-bold">{t.subject}</h1></div>
            <StatusBadge status={t.status} />
          </div>
          <TicketThread messages={q.data!.messages} viewer="customer" />
          <ResolutionCard
            status={t.status}
            feedbackRating={(t as any).feedback_rating}
            feedbackText={(t as any).feedback_text}
            onConfirm={async (rating, feedback) => {
              try { await confirmFn({ data: { id, rating, feedback } }); toast.success("Thanks for your feedback — ticket closed"); await qc.invalidateQueries({ queryKey: ["my-ticket", id] }); }
              catch (e: any) { toast.error(e?.message ?? "Could not close the ticket"); }
            }}
            onReopen={async () => {
              try { await reopenFn({ data: { id } }); toast.success("Ticket reopened — we'll take another look"); await qc.invalidateQueries({ queryKey: ["my-ticket", id] }); }
              catch (e: any) { toast.error(e?.message ?? "Could not reopen the ticket"); }
            }}
          />
          <ReplyBox closed={t.status === "closed"} newTicketHref="/app/support" onSend={async (body, files) => {
            try { await replyFn({ data: { id, body, files } }); toast.success("Reply sent"); await qc.invalidateQueries({ queryKey: ["my-ticket", id] }); }
            catch (e: any) { toast.error(e?.message ?? "Could not send"); }
          }} />
        </>
      )}
    </div>
  );
}
