import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldOff, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { adminListCompliance, adminReinstateAccount } from "@/lib/admin-overview.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Admin" }] }),
  component: AdminCompliancePage,
});

function AdminCompliancePage() {
  const fn = useServerFn(adminListCompliance);
  const reinstateFn = useServerFn(adminReinstateAccount);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "compliance"], queryFn: () => fn() });

  const reinstate = useMutation({
    mutationFn: (accountId: string) => reinstateFn({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Account reinstated");
      qc.invalidateQueries({ queryKey: ["admin", "compliance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reinstate"),
  });

  if (q.isLoading) {
    return <div className="flex justify-center h-32 items-center"><Loader2 className="size-6 animate-spin" /></div>;
  }

  const data = q.data ?? { blockedCampaigns: [], suspendedAccounts: [], events: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <ShieldOff className="size-6 text-destructive" /> Compliance
        </h1>
        <p className="text-sm text-muted-foreground">
          Campaigns blocked for prohibited content (SHAFT: Sex, Hate, Alcohol, Firearms, Tobacco) and auto-suspended tenant accounts.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Blocked campaigns" value={data.blockedCampaigns.length} tone="destructive" />
        <StatCard label="Suspended accounts" value={data.suspendedAccounts.length} tone="destructive" />
        <StatCard label="Recent compliance events" value={data.events.length} tone="muted" />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldOff className="size-4" /> Blocked campaigns
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Tenant</th>
                  <th className="p-3">Campaign</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {data.blockedCampaigns.map((c: any) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
                    <td className="p-3">{c.account_label}</td>
                    <td className="p-3">{c.name}</td>
                    <td className="p-3"><Badge variant="destructive">{c.paused_reason ?? "blocked_content"}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground max-w-md whitespace-pre-wrap">{c.message_body}</td>
                  </tr>
                ))}
                {data.blockedCampaigns.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No blocked campaigns.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4" /> Suspended accounts
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Suspended at</th>
                  <th className="p-3">Tenant</th>
                  <th className="p-3">Email</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.suspendedAccounts.map((a: any) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{a.suspended_at ? new Date(a.suspended_at).toLocaleString() : "—"}</td>
                    <td className="p-3">{a.legal_business_name || a.company || "—"}</td>
                    <td className="p-3 text-muted-foreground">{a.email}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reinstate.isPending}
                        onClick={() => reinstate.mutate(a.id)}
                      >
                        <ShieldCheck className="size-3.5 mr-1.5" /> Reinstate
                      </Button>
                    </td>
                  </tr>
                ))}
                {data.suspendedAccounts.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No suspended accounts.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Compliance events</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Tenant</th>
                  <th className="p-3">Payload</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e: any) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="p-3"><Badge variant="outline">{e.type}</Badge></td>
                    <td className="p-3">{e.account_label}</td>
                    <td className="p-3"><pre className="text-xs whitespace-pre-wrap max-w-xl text-muted-foreground">{e.payload ? JSON.stringify(e.payload, null, 2) : ""}</pre></td>
                  </tr>
                ))}
                {data.events.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No events.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "destructive" | "muted" }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}
