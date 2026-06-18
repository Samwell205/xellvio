import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Samwell Global SMS" }] }),
  component: CampaignsPage,
});

const tones: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-warning/15 text-warning-foreground border-warning/30",
  running: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

function CampaignsPage() {
  const q = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await supabase.from("campaigns").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">Create, schedule, and track multi-recipient sends.</p>
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr><th className="text-left py-3 px-4">Name</th><th className="text-left py-3 px-4">Status</th><th className="text-left py-3 px-4">Recipients</th><th className="text-left py-3 px-4">Sent</th><th className="text-left py-3 px-4">Failed</th><th className="text-left py-3 px-4">Created</th></tr>
            </thead>
            <tbody>
              {(q.data ?? []).length === 0 && <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No campaigns yet. Create one from the Send SMS page.</td></tr>}
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/20">
                  <td className="py-3 px-4 font-semibold">{c.name}</td>
                  <td className="py-3 px-4"><Badge className={tones[c.status] ?? ""} variant="outline">{c.status}</Badge></td>
                  <td className="py-3 px-4">{c.total_recipients}</td>
                  <td className="py-3 px-4 text-success">{c.sent_count}</td>
                  <td className="py-3 px-4 text-destructive">{c.failed_count}</td>
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
