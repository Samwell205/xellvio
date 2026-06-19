import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ShieldOff, UserCog } from "lucide-react";
import { toast } from "sonner";
import { adminListUsers, adminSetUserRole } from "@/lib/admin.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/app/admin/users")({
  head: () => ({ meta: [{ title: "User management — Admin" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
    if (error || data !== true) throw redirect({ to: "/app" });
  },
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListUsers);
  const setRoleFn = useServerFn(adminSetUserRole);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn({ data: undefined as any }),
  });

  const setRole = useMutation({
    mutationFn: (vars: { user_id: string; role: "admin" | "user"; grant: boolean }) =>
      setRoleFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <UserCog className="size-6" /> User management
        </h1>
        <p className="text-sm text-muted-foreground">
          Grant or revoke admin access. Only you (as owner) and other admins you appoint can access the Admin section.
        </p>
      </div>

      {users.isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Roles</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((u: any) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="p-3 font-medium">{u.full_name || "—"}</td>
                      <td className="p-3 text-muted-foreground">{u.email}</td>
                      <td className="p-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {u.is_admin && <Badge>admin</Badge>}
                          {u.roles.includes("user") && <Badge variant="secondary">user</Badge>}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        {u.is_admin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSelf || setRole.isPending}
                            onClick={() => setRole.mutate({ user_id: u.id, role: "admin", grant: false })}
                            title={isSelf ? "You cannot revoke your own admin role" : ""}
                          >
                            <ShieldOff className="size-3.5 mr-1.5" />Revoke admin
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={setRole.isPending}
                            onClick={() => setRole.mutate({ user_id: u.id, role: "admin", grant: true })}
                          >
                            <Shield className="size-3.5 mr-1.5" />Make admin
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(users.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
