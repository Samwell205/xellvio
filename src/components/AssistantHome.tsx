import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Loader2, MessageSquare, Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listAssistantThreads, newAssistantThread } from "@/lib/account-assistant.functions";
import { toast } from "sonner";

function useConversations(admin: boolean) {
  const create = useServerFn(newAssistantThread);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["assistant-threads"], queryFn: () => listAssistantThreads() });
  async function start() {
    if (creating) return;
    setCreating(true);
    try {
      const result = await create();
      void queryClient.invalidateQueries({ queryKey: ["assistant-threads"] });
      await navigate({ to: admin ? "/admin/account-assistant/$threadId" : "/app/assistant/$threadId", params: { threadId: result.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create conversation.");
    } finally { setCreating(false); }
  }
  return { query, creating, start };
}

export function AssistantMark() {
  return <div className="assistant-mark" aria-hidden="true"><MessageSquare className="size-7" /><span className="assistant-signal"><i /><i /><i /></span></div>;
}

export function AssistantThreads({ admin = false }: { admin?: boolean }) {
  const { query, creating, start } = useConversations(admin);
  const [search, setSearch] = useState("");
  const threads = (query.data ?? []).filter(thread => thread.title.toLowerCase().includes(search.toLowerCase()));
  return <aside className={`assistant-thread-rail flex w-full shrink-0 flex-col gap-4 border-b border-border bg-muted/30 p-4 md:sticky md:w-60 md:self-start md:border-b-0 md:border-r xl:w-64 ${admin ? "md:top-[72px] md:max-h-[calc(100vh-72px)]" : "md:top-14 md:max-h-[calc(100vh-3.5rem)]"}`}>
    <div className="flex items-center justify-between"><Link to={admin ? "/admin/account-assistant" : "/app/assistant"} className="flex items-center gap-2 font-display text-sm font-medium"><Sparkles className="size-4 text-primary" />Business assistant</Link><span className="size-1.5 rounded-full bg-success" /></div>
    <Button variant="secondary" className="w-full justify-between" disabled={creating} onClick={() => void start()}><span>New conversation</span>{creating ? <Loader2 className="animate-spin" /> : <Plus />}</Button>
    <div className="relative hidden md:block"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={event => setSearch(event.target.value)} className="bg-background pl-9 text-xs" /></div>
    <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-muted-foreground"><span>Conversations</span><span>{query.data?.length ?? "—"}</span></div>
    <nav aria-label="Assistant conversations" className="flex max-h-16 gap-2 overflow-auto md:min-h-0 md:block md:max-h-none md:flex-1 md:space-y-1 md:overflow-y-auto">
      {query.isPending ? [1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />) : query.isError ? <div role="alert" className="text-xs text-destructive">Conversations could not load.<Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Retry</Button></div> : threads.length ? threads.map(thread => <Button key={thread.id} variant="ghost" className="assistant-thread-link h-auto w-48 shrink-0 md:w-full justify-start gap-3 whitespace-normal rounded-md px-3 py-3 text-left" asChild><Link to={admin ? "/admin/account-assistant/$threadId" : "/app/assistant/$threadId"} params={{ threadId: thread.id }} activeProps={{ className: "bg-accent text-accent-foreground" }}><MessageSquare className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs font-medium">{thread.title}</span><span className="mt-1 block text-[10px] text-muted-foreground">{new Date(thread.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span></Link></Button>) : <p className="py-3 text-xs text-muted-foreground">{search ? "No matching conversations." : "No conversations yet."}</p>}
    </nav>
  </aside>;
}

export function AssistantWelcome({ admin = false }: { admin?: boolean }) {
  const { query, creating, start } = useConversations(admin);
  return <section className="assistant-home flex min-w-0 flex-1 flex-col px-5 py-8 md:px-8 md:py-10 xl:px-14">
    <div className="assistant-arrive flex items-center justify-between gap-3"><span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Xellvio / Assistant</span><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />Text assistant</span></div>
    <div className="assistant-arrive mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-8 md:py-14">
      <AssistantMark />
      <h1 className="mt-7 font-display text-3xl font-medium leading-tight md:text-4xl xl:text-5xl">Your business.<br /><span className="text-muted-foreground">A conversation away.</span></h1>
      <Button variant="secondary" className="assistant-start mt-8 h-14 w-full justify-between rounded-lg px-5 text-sm font-normal" disabled={creating} onClick={() => void start()}><span>What needs doing today?</span>{creating ? <Loader2 className="animate-spin" /> : <Plus className="size-5" />}</Button>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><MessageSquare className="size-3.5" />Conversations</span><span className="flex items-center gap-2"><Sparkles className="size-3.5" />Business assistant</span></div>
    </div>
    <div className="assistant-arrive mx-auto w-full max-w-2xl border-t border-border pt-6"><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-sm font-medium">Recent conversations</h2><MessageSquare className="size-4 text-muted-foreground" /></div>
      {query.isPending ? <Skeleton className="h-16 w-full" /> : query.isError ? <p role="alert" className="text-sm text-destructive">Recent conversations are unavailable.</p> : query.data?.length ? <div className="grid gap-3 sm:grid-cols-2">{query.data.slice(0, 2).map(thread => <Button key={thread.id} variant="outline" asChild className="assistant-recent h-auto min-w-0 justify-start gap-3 rounded-lg p-4"><Link to={admin ? "/admin/account-assistant/$threadId" : "/app/assistant/$threadId"} params={{ threadId: thread.id }}><MessageSquare className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm">{thread.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{new Date(thread.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></Link></Button>)}</div> : <p className="text-sm text-muted-foreground">No conversations yet.</p>}
    </div>
  </section>;
}
