import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Megaphone, CheckCircle2, XCircle, Wallet } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard — Samwell Global SMS" }] }),
  component: Overview,
});

function Overview() {
  const stats = useQuery({
    queryKey: ["dash-stats"],
    queryFn: async () => {
      const [{ count: total }, { count: delivered }, { count: failed }, { data: wallet }, { data: recent }] = await Promise.all([
        supabase.from("messages").select("*", { count: "exact", head: true }),
        supabase.from("messages").select("*", { count: "exact", head: true }).in("status", ["sent", "delivered"]),
        supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("wallets").select("balance_credits, currency").maybeSingle(),
        supabase.from("messages").select("created_at, status").order("created_at", { ascending: false }).limit(200),
      ]);
      // Build 7-day series
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return { day: d.toLocaleDateString(undefined, { weekday: "short" }), sent: 0, failed: 0, date: d.toISOString().slice(0, 10) };
      });
      recent?.forEach((m) => {
        const day = days.find((d) => d.date === new Date(m.created_at).toISOString().slice(0, 10));
        if (!day) return;
        if (m.status === "failed") day.failed++;
        else day.sent++;
      });
      return { total: total ?? 0, delivered: delivered ?? 0, failed: failed ?? 0, wallet: wallet ?? { balance_credits: 0, currency: "USD" }, days };
    },
  });

  const s = stats.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Overview</h1>
          <p className="text-sm text-muted-foreground">Live performance across your messaging.</p>
        </div>
        <Link to="/app/send"><Button>New message</Button></Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Send} label="Total Sent" value={s?.total ?? 0} />
        <Stat icon={CheckCircle2} label="Delivered" value={s?.delivered ?? 0} tone="success" />
        <Stat icon={XCircle} label="Failed" value={s?.failed ?? 0} tone="danger" />
        <Stat icon={Wallet} label="Credits" value={Number(s?.wallet.balance_credits ?? 0).toLocaleString()} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold">Daily Messages</h3>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={s?.days ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.62 0.21 255)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.62 0.21 255)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={12} stroke="currentColor" opacity={0.6} />
                <YAxis fontSize={12} stroke="currentColor" opacity={0.6} />
                <Tooltip />
                <Area type="monotone" dataKey="sent" stroke="oklch(0.62 0.21 255)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Failures</h3>
          <p className="text-xs text-muted-foreground">Last 7 days</p>
          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.days ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={12} stroke="currentColor" opacity={0.6} />
                <YAxis fontSize={12} stroke="currentColor" opacity={0.6} />
                <Tooltip />
                <Bar dataKey="failed" fill="oklch(0.6 0.22 27)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold">Quick actions</h3>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <ActionCard icon={Send} title="Send SMS" to="/app/send" desc="Single or bulk send" />
          <ActionCard icon={Megaphone} title="New campaign" to="/app/campaigns" desc="Schedule and target" />
          <ActionCard icon={Wallet} title="Top up credits" to="/app/billing" desc="Buy more credits" />
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; tone?: "success" | "danger" }) {
  const ring = tone === "success" ? "text-success bg-success/10" : tone === "danger" ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className={`size-10 rounded-lg grid place-items-center ${ring}`}><Icon className="size-5" /></div>
      </div>
      <div className="mt-3 text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function ActionCard({ icon: Icon, title, to, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; to: string; desc: string }) {
  return (
    <Link to={to} className="rounded-xl border bg-card p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
      <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Icon className="size-5" /></div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}
