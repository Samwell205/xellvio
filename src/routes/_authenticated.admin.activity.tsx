import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2 } from "lucide-react";
import { adminListEvents } from "@/lib/admin-overview.functions";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  head: () => ({ meta: [{ title: "Activity log — Admin" }] }),
  component: AdminActivityPage,
});

function AdminActivityPage() {
  const fn = useServerFn(adminListEvents);
  const q = useQuery({ queryKey: ["admin", "events"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Activity className="size-6" /> Activity log</h1>
        <p className="text-sm text-muted-foreground">Most recent 200 system events across all tenants.</p>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center h-32 items-center"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">Payload</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((e: any) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="p-3"><Badge variant="outline">{e.type}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{e.account_id ?? "—"}</td>
                    <td className="p-3"><pre className="text-xs whitespace-pre-wrap max-w-2xl text-muted-foreground">{e.payload ? JSON.stringify(e.payload, null, 2) : ""}</pre></td>
                  </tr>
                ))}
                {(q.data ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No events yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
