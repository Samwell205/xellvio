import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Megaphone, CheckCircle2, RefreshCw, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard — Samwell Global SMS" }] }),
  component: Overview,
});

function Overview() {
  const stats = useQuery({
    queryKey: ["dash-stats"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [
        { count: subscribed },
        { count: campaignsSent },
        { count: delivered },
        { count: totalMessages },
      ] = await Promise.all([
        supabase.from("consents").select("*", { count: "exact", head: true }).eq("status", "subscribed"),
        supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "delivered"),
        supabase.from("messages").select("*", { count: "exact", head: true }),
      ]);
      const rate = totalMessages && totalMessages > 0 ? Math.round(((delivered ?? 0) / totalMessages) * 100) : 0;
      return { subscribed: subscribed ?? 0, campaignsSent: campaignsSent ?? 0, deliveryRate: rate, delivered: delivered ?? 0 };
    },
  });

  const s = stats.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            High-level performance.
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
              <RefreshCw className={`size-3 ${stats.isFetching ? "animate-spin" : ""}`} /> live
            </span>
          </p>
        </div>
        <Link to="/app/campaigns"><Button><Megaphone className="size-4 mr-1.5" />Campaigns</Button></Link>
      </div>


      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Subscribed contacts" value={s?.subscribed ?? 0} />
        <Stat icon={Megaphone} label="Campaigns sent" value={s?.campaignsSent ?? 0} />
        <Stat icon={CheckCircle2} label="Delivery rate" value={`${s?.deliveryRate ?? 0}%`} tone="success" />
        <Stat icon={Send} label="Messages delivered" value={s?.delivered ?? 0} />
      </div>

      <RecentCampaigns />
    </div>
  );
}

function RecentCampaigns() {
  const q = useQuery({
    queryKey: ["dash-recent-campaigns"],
    refetchInterval: 10_000,
    queryFn: async () =>
      (await supabase.from("campaigns").select("id,name,status,created_at,schedule_at").order("created_at", { ascending: false }).limit(5)).data ?? [],
  });
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Recent campaigns</h3>
        <Link to="/app/campaigns" className="text-xs text-primary hover:underline">View all →</Link>
      </div>
      {(q.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No campaigns yet. Create your first one.</p>
      ) : (
        <ul className="divide-y">
          {q.data!.map((c) => (
            <li key={c.id} className="py-2.5 flex items-center justify-between">
              <Link to="/app/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.name}</Link>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="capitalize">{c.status}</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; tone?: "success" }) {
  const ring = tone === "success" ? "text-success bg-success/10" : "text-primary bg-primary/10";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-lg grid place-items-center ${ring}`}><Icon className="size-5" /></div>
      <div className="mt-3 text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
