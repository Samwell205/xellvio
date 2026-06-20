import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Megaphone, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — Xellvio" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const q = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 8_000,
    queryFn: async () =>
      (await supabase.from("campaigns").select("id,name,status,send_mode,schedule_at,created_at").order("created_at", { ascending: false })).data ?? [],
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("campaigns").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message ?? "Failed to delete campaign");
      return;
    }
    toast.success(`Deleted "${toDelete.name}"`);
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Campaigns</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            Create, schedule, and track SMS campaigns.
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
              <RefreshCw className={`size-3 ${q.isFetching ? "animate-spin" : ""}`} /> live
            </span>
          </p>
        </div>
        <Link to="/app/campaigns/new"><Button>
          <Plus className="size-4 mr-1.5" />New campaign
        </Button></Link>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Mode</th>
                <th className="text-left py-3 px-4">Scheduled</th>
                <th className="text-left py-3 px-4">Created</th>
                <th className="text-right py-3 px-4 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Megaphone className="size-8 mx-auto text-muted-foreground/60 mb-3" />
                    <div className="font-medium">No campaigns yet</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click <strong>New campaign</strong> to create your first one.
                    </p>
                  </td>
                </tr>
              )}
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/20">
                  <td className="py-3 px-4 font-semibold">
                    {c.status === "draft" ? (
                      <Link to="/app/campaigns/new" search={{ id: c.id }} className="hover:underline">{c.name}</Link>
                    ) : (
                      <Link to="/app/campaigns/$id" params={{ id: c.id }} className="hover:underline">{c.name}</Link>
                    )}
                  </td>
                  <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                  <td className="py-3 px-4 capitalize">{c.send_mode}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.schedule_at ? new Date(c.schedule_at).toLocaleString() : "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setToDelete({ id: c.id, name: c.name })}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" and all of its message records will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
