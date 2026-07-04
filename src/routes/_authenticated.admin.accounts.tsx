import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldOff, ShieldCheck, Ban, PlayCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { adminSetSuspension } from "@/lib/account.functions";
import { adminSuspendTenantSending, adminResumeTenantSending } from "@/lib/compliance-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  head: () => ({ meta: [{ title: "Tenant accounts — Admin" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
    if (error || data !== true) throw redirect({ to: "/app" });
  },
  component: AdminAccountsPage,
});

function AdminAccountsPage() {
  const qc = useQueryClient();
  const accounts = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,email,legal_business_name,company,onboarding_status,credit_balance,suspended_at,sending_suspended_at,sending_suspended_reason,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const suspendFn = useServerFn(adminSetSuspension);
  const setStatus = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      suspendFn({ data: { accountId: id, suspend } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "accounts"] });
      toast.success("Tenant updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const killFn = useServerFn(adminSuspendTenantSending);
  const resumeFn = useServerFn(adminResumeTenantSending);
  const killSwitch = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      killFn({ data: { accountId: id, reason } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "accounts"] });
      toast.success(r.telnyxOk ? "Sending paused (Telnyx profile disabled)" : `Sending paused locally — Telnyx: ${r.telnyxError ?? "err"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resumeSending = useMutation({
    mutationFn: (id: string) => resumeFn({ data: { accountId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "accounts"] });
      toast.success("Sending resumed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Tenant accounts</h1>
        <p className="text-sm text-muted-foreground">All customer accounts on the platform.</p>
      </div>

      {accounts.isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Business</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(accounts.data ?? []).map((a) => {
                  const suspended = a.onboarding_status === "suspended";
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-medium">{a.legal_business_name || a.company || "—"}</td>
                      <td className="p-3 text-muted-foreground">{a.email}</td>
                      <td className="p-3">
                        <Badge variant={suspended ? "destructive" : a.onboarding_status === "active" ? "default" : "secondary"}>
                          {a.onboarding_status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right tabular-nums">${Number(a.credit_balance).toFixed(2)}</td>
                      <td className="p-3 text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant={suspended ? "outline" : "destructive"}
                          onClick={() => setStatus.mutate({ id: a.id, suspend: !suspended })}
                          disabled={setStatus.isPending}
                        >
                          {suspended ? <><ShieldCheck className="size-3.5 mr-1.5" />Reinstate</> : <><ShieldOff className="size-3.5 mr-1.5" />Suspend</>}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {(accounts.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No accounts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
