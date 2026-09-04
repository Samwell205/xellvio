import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, MoreHorizontal, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createAutomation, deleteAutomation, duplicateAutomation, listAutomations } from "@/lib/automations.functions";
import { stepDef } from "@/lib/automation-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/automations/")({
  head: () => ({
    meta: [
      { title: "Automations — visual flow builder — Xellvio" },
      {
        name: "description",
        content: "Build automations on a drag-and-drop canvas: triggers, messages, waits, conditions and split tests.",
      },
      { property: "og:title", content: "Automations — visual flow builder — Xellvio" },
      {
        property: "og:description",
        content: "Build automations on a drag-and-drop canvas: triggers, messages, waits, conditions and split tests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listAutomations);
  const create = useServerFn(createAutomation);
  const duplicate = useServerFn(duplicateAutomation);
  const remove = useServerFn(deleteAutomation);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["automations"], queryFn: () => list() });

  const createMutation = useMutation({
    mutationFn: async (n: string) => create({ data: { name: n } }),
    onSuccess: ({ id }) => {
      setNewOpen(false);
      setName("");
      void navigate({ to: "/app/automations/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design multi-step journeys on a canvas — triggers, messages, waits and branches.
          </p>
        </div>
        <Button
          onClick={() => {
            setName(`Automation — ${new Date().toLocaleDateString()}`);
            setNewOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New automation
        </Button>
      </div>

      <div className="mt-6 space-y-2">
        {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading your automations…</Card>}
        {!isLoading && !rows.length && (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Workflow className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold">No automations yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create your first automation and drop steps onto the canvas to build a journey.
            </p>
            <Button
              onClick={() => {
                setName(`Automation — ${new Date().toLocaleDateString()}`);
                setNewOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New automation
            </Button>
          </Card>
        )}
        {rows.map((a) => (
          <Card key={a.id} className="flex items-center gap-4 p-4 transition hover:shadow-md">
            <Link to="/app/automations/$id" params={{ id: a.id }} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{a.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.step_count} step{a.step_count === 1 ? "" : "s"}
                {a.trigger ? ` · starts on ${stepDef(a.trigger).label}` : " · no trigger yet"} · updated{" "}
                {new Date(a.updated_at).toLocaleString()}
              </p>
            </Link>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                a.status === "active"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : a.status === "paused"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {a.status === "active" ? "● Active" : a.status === "paused" ? "○ Paused" : "Draft"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Automation options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    const { id } = await duplicate({ data: { id: a.id } });
                    toast.success("Automation duplicated");
                    void navigate({ to: "/app/automations/$id", params: { id } });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    await remove({ data: { id: a.id } });
                    toast.success("Automation deleted");
                    void qc.invalidateQueries({ queryKey: ["automations"] });
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Card>
        ))}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an automation</DialogTitle>
            <DialogDescription>Give it a name — you can change this later in the builder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome sequence" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate(name.trim())}>
              Create and open builder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
