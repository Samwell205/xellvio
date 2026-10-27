import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, Loader2, Lock, RotateCcw, Send, Star, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, TicketThread } from "@/components/support/TicketThread";
import { adminDraftTicketReply, adminGetTicket, adminReplyTicket, adminSetTicketStatus } from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/_authenticated/admin/tickets/$id")({
  head: () => ({ meta: [{ title: "Ticket — Admin" }] }),
  component: AdminTicket,
});

function AdminTicket() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetTicket);
  const replyFn = useServerFn(adminReplyTicket);
  const statusFn = useServerFn(adminSetTicketStatus);
  const draftFn = useServerFn(adminDraftTicketReply);
  const q = useQuery({ queryKey: ["admin-ticket", id], queryFn: () => getFn({ data: { id } }) });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-ticket", id] }), qc.invalidateQueries({ queryKey: ["admin-tickets"] })]);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); await refresh(); } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(null); }
  };
  const t = q.data?.ticket;
  const acct = q.data?.account;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/admin/tickets" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All tickets</Link>
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : !t ? <Card className="p-8 text-center">Ticket not found.</Card> : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Ticket #{t.number} · {t.requester_name ? `${t.requester_name} · ` : ""}{t.requester_email}</p>
              <h1 className="text-2xl font-bold">{t.subject}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {acct ? <>Tenant: {acct.legal_business_name ?? acct.email} · balance ${Number(acct.credit_balance ?? 0).toFixed(2)}{acct.sending_suspended_at ? " · sending suspended" : ""}</> : "No tenant account matches this email"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={t.status} />
              {t.status === "closed"
                ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("reopen", () => statusFn({ data: { id, status: "open" } }), "Reopened")}><RotateCcw className="size-4" /> Reopen</Button>
                : <>
                    {t.status !== "resolved" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("resolve", () => statusFn({ data: { id, status: "resolved" } }), "Marked resolved — customer asked to confirm")}><CheckCircle2 className="size-4" /> Mark resolved</Button>}
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("close", () => statusFn({ data: { id, status: "closed" } }), "Ticket closed")}><Lock className="size-4" /> Close</Button>
                  </>}
            </div>
          </div>
          {(t as any).feedback_rating != null && (
            <Card className="flex flex-wrap items-center gap-2 border-primary/30 bg-primary/5 p-4 text-sm">
              <CheckCircle2 className="size-4 text-primary" />
              <span className="font-medium">Customer confirmed the fix</span>
              <span className="flex items-center gap-0.5" aria-label={`${(t as any).feedback_rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`size-4 ${s <= (t as any).feedback_rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
                ))}
              </span>
              {(t as any).feedback_text && <span className="text-muted-foreground">— “{(t as any).feedback_text}”</span>}
            </Card>
          )}
          <TicketThread messages={q.data!.messages} viewer="admin" />
          <Card className="space-y-3 p-4">
            <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply to the customer, or an internal note…" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => run("draft", async () => {
                const r = await draftFn({ data: { id } }); setText(r.draft);
              }, "Draft ready — review before sending")}>
                {busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />} Draft with copilot
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" disabled={!!busy || !text.trim()} onClick={() => run("note", async () => { await replyFn({ data: { id, body: text, internal: true, close: false } }); setText(""); }, "Note added")}><StickyNote className="size-4" /> Internal note</Button>
                <Button variant="outline" size="sm" disabled={!!busy || !text.trim()} onClick={() => run("sendresolve", async () => { await replyFn({ data: { id, body: text, internal: false, close: false, resolve: true } }); setText(""); }, "Sent — customer asked to confirm the fix")}>Send & mark resolved</Button>
                <Button variant="outline" size="sm" disabled={!!busy || !text.trim()} onClick={() => run("sendclose", async () => { await replyFn({ data: { id, body: text, internal: false, close: true } }); setText(""); }, "Sent and closed")}>Send & close</Button>
                <Button size="sm" disabled={!!busy || !text.trim()} onClick={() => run("send", async () => { await replyFn({ data: { id, body: text, internal: false, close: false } }); setText(""); }, "Reply sent")}>
                  {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send reply
                </Button>
              </div>
            </div>
            {t.status === "closed" && <p className="text-xs text-muted-foreground">Sending a reply reopens the conversation as "waiting on customer".</p>}
          </Card>
        </>
      )}
    </div>
  );
}
