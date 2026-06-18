import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Samwell Global SMS" }] }),
  component: ReportsPage,
});

const COLORS = ["oklch(0.62 0.21 255)", "oklch(0.65 0.17 150)", "oklch(0.78 0.17 75)", "oklch(0.6 0.22 27)"];

function ReportsPage() {
  const q = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("status,country,created_at").order("created_at", { ascending: false }).limit(1000);
      const days: Record<string, { day: string; sent: number; failed: number }> = {};
      const byCountry: Record<string, number> = {};
      const byStatus: Record<string, number> = { sent: 0, delivered: 0, failed: 0, queued: 0 };
      data?.forEach((m) => {
        const d = new Date(m.created_at).toLocaleDateString();
        days[d] ??= { day: d, sent: 0, failed: 0 };
        if (m.status === "failed") days[d].failed++; else days[d].sent++;
        byCountry[m.country || "Unknown"] = (byCountry[m.country || "Unknown"] || 0) + 1;
        byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      });
      return {
        days: Object.values(days).slice(0, 14).reverse(),
        countries: Object.entries(byCountry).slice(0, 6).map(([name, value]) => ({ name, value })),
        status: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      };
    },
  });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold">Reports</h1><p className="text-sm text-muted-foreground">Performance and delivery analytics.</p></div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Messages per day</h3>
        <div className="h-72"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={q.data?.days ?? []}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="sent" stroke="oklch(0.62 0.21 255)" strokeWidth={2} /><Line type="monotone" dataKey="failed" stroke="oklch(0.6 0.22 27)" strokeWidth={2} /></LineChart>
        </ResponsiveContainer></div>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Top countries</h3>
          <div className="h-64"><ResponsiveContainer><PieChart>
            <Pie data={q.data?.countries ?? []} dataKey="value" nameKey="name" outerRadius={90}>
              {(q.data?.countries ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Legend /><Tooltip /></PieChart></ResponsiveContainer></div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">By status</h3>
          <div className="h-64"><ResponsiveContainer><PieChart>
            <Pie data={q.data?.status ?? []} dataKey="value" nameKey="name" outerRadius={90}>
              {(q.data?.status ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Legend /><Tooltip /></PieChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}
