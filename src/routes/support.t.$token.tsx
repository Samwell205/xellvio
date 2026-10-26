import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Card } from "@/components/ui/card";
import { ReplyBox, StatusBadge, TicketThread } from "@/components/support/TicketThread";
import { getTicketByToken, replyByToken } from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/support/t/$token")({
  head: () => ({
    meta: [
      { title: "Your support ticket — Xellvio" },
      { name: "description", content: "View and reply to your Xellvio support ticket." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Your support ticket — Xellvio" },
      { property: "og:description", content: "View and reply to your Xellvio support ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getTicketByToken);
  const replyFn = useServerFn(replyByToken);
  const q = useQuery({ queryKey: ["public-ticket", token], queryFn: () => getFn({ data: { token } }), retry: false });
  const t = q.data?.ticket;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : !t ? (
          <Card className="p-8 text-center">This ticket link is invalid. <a className="text-primary underline" href="/contact">Contact support</a>.</Card>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Ticket #{t.number}</p>
                <h1 className="text-2xl font-bold">{t.subject}</h1>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <TicketThread messages={q.data!.messages} viewer="customer" />
            <ReplyBox closed={t.status === "closed"} newTicketHref="/contact" onSend={async (body, files) => {
              try { await replyFn({ data: { token, body, files } }); toast.success("Reply sent"); await qc.invalidateQueries({ queryKey: ["public-ticket", token] }); }
              catch (e: any) { toast.error(e?.message ?? "Could not send"); }
            }} />
          </div>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
