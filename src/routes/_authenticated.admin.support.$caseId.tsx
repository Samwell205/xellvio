import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Copy, ImagePlus, Link2, Loader2, Send, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  askCopilot, getSupportCase, runCopilotAction, searchTenants, setCaseTenant, type CopilotMessage,
} from "@/lib/support-copilot.functions";

export const Route = createFileRoute("/_authenticated/admin/support/$caseId")({
  component: CasePage,
});

type Action = { action: "resume_campaign" | "lift_hold"; target: string; reason: string };

function parse(content: string) {
  const reply = content.match(/```reply\s*\n([\s\S]*?)```/)?.[1]?.trim() ?? null;
  const actions: Action[] = [];
  for (const m of content.matchAll(/ACTION:\s*(resume_campaign|lift_hold)\s+([0-9a-f-]{36})\s*\|?\s*(.*)/gi)) {
    actions.push({ action: m[1].toLowerCase() as Action["action"], target: m[2], reason: m[3]?.trim() ?? "" });
  }
  const body = content.replace(/```reply\s*\n[\s\S]*?```/, "").replace(/^.*ACTION:.*$/gim, "").replace(/^\s*(#+\s*)?\**Reply to send\**:?\s*$/gim, "").trim();
  return { reply, actions, body };
}

// Shrink screenshots in the browser so they upload fast and stay readable.
async function toDataUrl(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const max = 2000;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function CasePage() {
  const { caseId } = Route.useParams();
  return <CaseView key={caseId} caseId={caseId} />;
}

function CaseView({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const key = ["support-case", caseId];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { id: caseId } }) });
  const getFn = useServerFn(getSupportCase);
  const askFn = useServerFn(askCopilot);
  const actFn = useServerFn(runCopilotAction);
  const setTenantFn = useServerFn(setCaseTenant);
  const searchFn = useServerFn(searchTenants);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ text: string; images: string[] } | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    try {
      const urls = await Promise.all(list.map(toDataUrl));
      setImages((cur) => {
        const next = [...cur, ...urls].slice(0, 4);
        if (cur.length + urls.length > 4) toast.message("Up to 4 screenshots per message");
        return next;
      });
    } catch { toast.error("Couldn't read that image"); }
  };
  const [search, setSearch] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const results = useQuery({
    queryKey: ["tenant-search", search],
    queryFn: () => searchFn({ data: { q: search } }),
    enabled: search.trim().length >= 2,
  });

  const ask = useMutation({
    mutationFn: (v: { text: string; images: string[] }) => askFn({ data: { id: caseId, message: v.text, images: v.images } }),
    onMutate: (v) => { setPending(v); setText(""); setImages([]); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["support-cases"] }); },
    onError: (e: Error, v) => { toast.error(e.message); setText(v.text); setImages(v.images); },
    onSettled: () => { setPending(null); taRef.current?.focus(); },
  });
  const link = useMutation({
    mutationFn: (accountId: string | null) => setTenantFn({ data: { id: caseId, accountId } }),
    onSuccess: () => { setSearch(""); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const act = useMutation({
    mutationFn: (a: Action) => actFn({ data: { caseId, action: a.action, target: a.target } }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e: Error) => toast.error(e.message),
  });

  const messages: CopilotMessage[] = q.data?.messages ?? [];
  useEffect(() => { taRef.current?.focus(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, pending]);

  const send = () => { const t = text.trim(); if ((t || images.length) && !ask.isPending) ask.mutate({ text: t, images }); };
  const tenant = q.data?.tenant;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Link2 className="size-4 text-muted-foreground" />
        {tenant ? (
          <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm">
            {tenant.company ?? "Tenant"} · {tenant.email}
            <button aria-label="Unlink tenant" onClick={() => link.mutate(null)}><X className="size-3" /></button>
          </span>
        ) : (
          <div className="relative w-80">
            <Input placeholder="Link tenant — search email or company" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow">
                {(results.data ?? []).map((r) => (
                  <button key={r.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => link.mutate(r.id)}>
                    <div className="font-medium">{r.company ?? r.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </button>
                ))}
                {results.data && !results.data.length && <p className="px-3 py-2 text-sm text-muted-foreground">No match</p>}
              </div>
            )}
          </div>
        )}
        <span className="text-xs text-muted-foreground">Tip: the tenant links automatically when the message contains their email or sending number.</span>
      </header>
      {!q.isLoading && !tenant && messages.length > 0 && (
        <div className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          No tenant is linked, so answers are generic. Link the tenant above, then ask again for an account-specific reply.
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!q.isLoading && !messages.length && !pending && (
          <p className="text-sm text-muted-foreground">Paste the tenant's message below. You can also ask things like "review this account" or "why did their last campaign fail?".</p>
        )}
        {messages.map((m, i) => m.role === "user"
          ? <UserBubble key={i} text={m.content} images={m.images} />
          : <AssistantMessage key={i} content={m.content} onAction={(a) => { if (confirm(`${a.action === "lift_hold" ? "Lift the sending hold" : "Resume this campaign"}?\n\n${a.reason}`)) act.mutate(a); }} busy={act.isPending} />)}
        {pending && <>
          <UserBubble text={pending.text} images={pending.images} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reviewing the account and drafting a reply…</div>
        </>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}>
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`Screenshot ${i + 1}`} className="h-16 w-24 rounded-md border border-border object-cover" />
                <button aria-label="Remove screenshot" onClick={() => setImages((c) => c.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"><X className="size-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
          <Button size="icon" variant="ghost" type="button" aria-label="Attach screenshot" title="Attach screenshot (or paste / drop one)" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-4" />
          </Button>
          <Textarea ref={taRef} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the tenant's message or a screenshot, or ask a question…"
            onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); void addFiles(f); } }}
            className="min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button size="icon" onClick={send} disabled={ask.isPending || (!text.trim() && !images.length)} aria-label="Send">
            {ask.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text, images }: { text: string; images?: string[] }) {
  return (
    <div className="ml-auto max-w-[75%] space-y-2">
      {images?.length ? (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Screenshot ${i + 1}`} className="max-h-48 rounded-lg border border-border" /></a>
          ))}
        </div>
      ) : null}
      <div className="whitespace-pre-wrap rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">{text}</div>
    </div>
  );
}

function AssistantMessage({ content, onAction, busy }: { content: string; onAction: (a: Action) => void; busy: boolean }) {
  const { reply, actions, body } = parse(content);
  return (
    <div className="max-w-[85%] space-y-4">
      <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown components={{
        h2: ({ children }) => <h2 className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-primary">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-3 font-semibold">{children}</h3>,
        p: ({ children }) => <p className="mb-2 text-sm leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
      }}>{body}</ReactMarkdown></div>
      {reply && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Reply to send</span>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(reply); toast.success("Reply copied"); }}><Copy className="size-3" /> Copy</Button>
          </div>
          <p className="whitespace-pre-wrap text-sm">{reply}</p>
        </div>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <Button key={i} size="sm" variant="secondary" disabled={busy} onClick={() => onAction(a)} title={a.reason}>
              <Wrench className="size-3" /> {a.action === "lift_hold" ? "Lift sending hold" : "Resume campaign"}{a.reason ? ` — ${a.reason.slice(0, 40)}` : ""}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
