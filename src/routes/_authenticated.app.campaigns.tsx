import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, RefreshCw, Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Samwell Global SMS" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const q = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 8_000,
    queryFn: async () =>
      (await supabase.from("campaigns").select("id,name,status,send_mode,schedule_at,created_at").order("created_at", { ascending: false })).data ?? [],
  });

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
        <Button onClick={() => toast.info("Campaign builder ships in Phase 4 of the rebuild.")}>
          <Plus className="size-4 mr-1.5" />New campaign
        </Button>
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
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Megaphone className="size-8 mx-auto text-muted-foreground/60 mb-3" />
                    <div className="font-medium">No campaigns yet</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      The campaign builder ships in the next phase of the rebuild.
                    </p>
                  </td>
                </tr>
              )}
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/20">
                  <td className="py-3 px-4 font-semibold">{c.name}</td>
                  <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                  <td className="py-3 px-4 capitalize">{c.send_mode}</td>
                  <td className="py-3 px-4 text-muted-foreground">{c.schedule_at ? new Date(c.schedule_at).toLocaleString() : "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
