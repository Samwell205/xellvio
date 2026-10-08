import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupportCase, deleteSupportCase, listSupportCases } from "@/lib/support-copilot.functions";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () => ({ meta: [{ title: "Admin · Support copilot — Xellvio" }] }),
  component: Layout,
});

function Layout() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const list = useQuery({ queryKey: ["support-cases"], queryFn: useServerFn(listSupportCases) });
  const createFn = useServerFn(createSupportCase);
  const delFn = useServerFn(deleteSupportCase);
  const create = useMutation({
    mutationFn: () => createFn(),
    onSuccess: async (r) => { await qc.invalidateQueries({ queryKey: ["support-cases"] }); nav({ to: "/admin/support/$caseId", params: { caseId: r.id } }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["support-cases"] }); nav({ to: "/admin/support" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[600px]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Bot className="size-5 text-primary" />
          <span className="font-semibold">Support cases</span>
        </div>
        <div className="p-3"><Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="size-4" /> New case</Button></div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {(list.data ?? []).map((c) => (
            <div key={c.id} className="group flex items-center rounded-md hover:bg-accent">
              <Link to="/admin/support/$caseId" params={{ caseId: c.id }} className="min-w-0 flex-1 px-2 py-2 text-sm" activeProps={{ className: "font-semibold text-primary" }}>
                <div className="truncate">{c.title}</div>
                <div className="text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleString()}</div>
              </Link>
              <button aria-label="Delete case" className="p-2 opacity-0 group-hover:opacity-100" onClick={() => { if (confirm("Delete this case?")) del.mutate(c.id); }}>
                <Trash2 className="size-4 text-muted-foreground" />
              </button>
            </div>
          ))}
          {!list.isLoading && !list.data?.length && <p className="px-2 text-sm text-muted-foreground">No cases yet.</p>}
        </nav>
      </aside>
      <section className="min-w-0 flex-1"><Outlet /></section>
    </div>
  );
}
