import { useState } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ThreadMsg = { id: string; author: "customer" | "admin" | "system"; body: string; internal?: boolean; created_at: string };

export function StatusBadge({ status }: { status: string }) {
  const label = status === "waiting" ? "Awaiting your reply" : status === "closed" ? "Closed" : "Open";
  return <Badge variant={status === "closed" ? "secondary" : "default"}>{label}</Badge>;
}

export function TicketThread({ messages, viewer }: { messages: ThreadMsg[]; viewer: "customer" | "admin" }) {
  return (
    <div className="space-y-4">
      {messages.map((m) => m.author === "system" ? (
        <p key={m.id} className="text-center text-xs text-muted-foreground">{m.body} · {new Date(m.created_at).toLocaleString()}</p>
      ) : (
        <div key={m.id} className={cn("max-w-[85%] rounded-2xl border px-4 py-3",
          m.internal ? "mx-auto border-dashed border-warning/50 bg-warning/10" :
          (m.author === viewer ? "ml-auto border-primary/30 bg-primary/10" : "border-border bg-card"))}>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {m.internal ? "Internal note" : m.author === "admin" ? "Xellvio Support" : viewer === "admin" ? "Customer" : "You"} · {new Date(m.created_at).toLocaleString()}
          </div>
          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

export function ReplyBox({ closed, onSend, newTicketHref }: { closed: boolean; onSend: (body: string) => Promise<unknown>; newTicketHref: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (closed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <span className="flex items-center gap-2"><Lock className="size-4" /> This ticket is closed — open a new ticket if you still need help.</span>
        <Button asChild size="sm"><a href={newTicketHref}>Open a new ticket</a></Button>
      </div>
    );
  }
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!text.trim() || busy) return;
      setBusy(true);
      try { await onSend(text.trim()); setText(""); } finally { setBusy(false); }
    }}>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your reply…" />
      <div className="flex justify-end"><Button type="submit" disabled={busy || !text.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send reply</Button></div>
    </form>
  );
}
