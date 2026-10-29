import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listEmailCampaigns } from "@/lib/email-campaigns.functions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, RefreshCw, Megaphone, Trash2, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns/")({
  head: () => ({ meta: [{ title: "SMS and email campaigns — Xellvio" }, { name: "description", content: "Manage and track your Xellvio SMS and email campaigns." }, { property: "og:title", content: "SMS and email campaigns — Xellvio" }, { property: "og:description", content: "Manage and track business campaigns in Xellvio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [channel, setChannel] = useState("sms");
  const listEmails = useServerFn(listEmailCampaigns);
  const emails = useQuery({ queryKey: ["email-campaigns"], queryFn: () => listEmails(), refetchInterval: channel === "email" ? 10000 : false });

  const q = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 8_000,
    queryFn: async () =>
      (
        await supabase
          .from("campaigns")
          .select("id,name,status,send_mode,schedule_at,created_at")
          .order("created_at", { ascending: false })
      ).data ?? [],
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
            SMS and email campaigns.
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
              <RefreshCw className={`size-3 ${q.isFetching ? "animate-spin" : ""}`} /> live
            </span>
          </p>
        </div>
        <Link to={channel === "email" ? "/app/campaigns/email" : "/app/campaigns/new"}>
          <Button>
            <Plus className="size-4 mr-1.5" />
            New {channel === "email" ? "email" : "SMS"} campaign
          </Button>
        </Link>
      </div>

      <Tabs value={channel} onValueChange={setChannel}><TabsList><TabsTrigger value="sms">SMS</TabsTrigger><TabsTrigger value="email"><Mail className="mr-1 size-4" />Email</TabsTrigger></TabsList></Tabs>
      {channel === "email" ? <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-muted-foreground"><tr><th className="p-4">Campaign</th><th className="p-4">Status</th><th className="p-4">Recipients</th><th className="p-4">Created</th><th className="p-4"></th></tr></thead><tbody>{emails.data?.map((c) => <tr key={c.id} className="border-t"><td className="p-4"><Link to="/app/campaigns/email" search={{ id: c.id }} className="font-semibold hover:underline">{c.name}</Link><div className="text-xs text-muted-foreground">{c.subject}</div></td><td className="p-4"><Badge variant="secondary" className="capitalize">{c.status}</Badge></td><td className="p-4">{c.total.toLocaleString()}</td><td className="p-4">{new Date(c.created_at).toLocaleDateString()}</td><td className="p-4"><Link to="/app/campaigns/email" search={{ id: c.id }}><Button variant="ghost" size="sm">{c.status === "draft" ? "Edit draft" : "Report"}</Button></Link></td></tr>)}{emails.error && <tr><td colSpan={5} className="p-6 text-destructive">{emails.error.message}</td></tr>}{!emails.data?.length && !emails.isLoading && !emails.error && <tr><td colSpan={5} className="py-14 text-center text-muted-foreground">No email campaigns yet.</td></tr>}</tbody></table></div> : <Card className="p-0 overflow-hidden">
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
                      <Link
                        to="/app/campaigns/new"
                        search={{ id: c.id }}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <Link
                        to="/app/campaigns/$id"
                        params={{ id: c.id }}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 px-4 capitalize">{c.send_mode}</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {c.schedule_at ? new Date(c.schedule_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {c.status !== "draft" && (
                      <Link to="/app/campaigns/$id/report" params={{ id: c.id }}>
                        <Button variant="ghost" size="sm" className="mr-1">
                          Report
                        </Button>
                      </Link>
                    )}
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
      </Card>}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" and all of its message records will be permanently removed. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
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
