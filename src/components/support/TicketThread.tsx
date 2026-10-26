import { useRef, useState } from "react";
import { Loader2, Lock, Paperclip, Send, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ThreadMsg = { id: string; author: "customer" | "admin" | "system"; body: string; internal?: boolean; created_at: string; attachments?: { name: string; size: number; type: string; url?: string }[] };
export type UploadFile = { name: string; type: string; data: string };

const MAX = 10 * 1024 * 1024;
function toBase64(f: File) {
  return new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
}

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
          {!!m.attachments?.length && (
            <div className="mt-2 flex flex-wrap gap-2">
              {m.attachments.map((a, i) => a.type.startsWith("image/") && a.url ? (
                <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-40 rounded-lg border border-border" /></a>
              ) : (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"><FileText className="size-3.5" />{a.name} · {Math.max(1, Math.round(a.size / 1024))} KB</a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReplyBox({ closed, onSend, newTicketHref }: { closed: boolean; onSend: (body: string, files: UploadFile[]) => Promise<unknown>; newTicketHref: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
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
      try {
        const files = await Promise.all(picked.map(async (f) => ({ name: f.name, type: f.type, data: await toBase64(f) })));
        await onSend(text.trim(), files); setText(""); setPicked([]);
      } finally { setBusy(false); }
    }}>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your reply…" />
      {!!picked.length && (
        <div className="flex flex-wrap gap-2">
          {picked.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
              <Paperclip className="size-3" />{f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <input ref={input} type="file" multiple hidden accept="image/*,.pdf,.csv,.txt,.xls,.xlsx,.doc,.docx" onChange={(e) => {
        const list = Array.from(e.target.files ?? []); e.target.value = "";
        const big = list.find((f) => f.size > MAX);
        setErr(big ? `"${big.name}" is larger than 10 MB.` : "");
        setPicked((p) => [...p, ...list.filter((f) => f.size <= MAX)].slice(0, 5));
      }} />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy || picked.length >= 5} onClick={() => input.current?.click()}><Paperclip className="size-4" /> Attach file</Button>
        <Button type="submit" disabled={busy || !text.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send reply</Button></div>
    </form>
  );
}
