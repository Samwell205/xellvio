import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Mail, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listMyTeam,
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({ meta: [{ title: "Team — Xellvio" }] }),
  component: TeamPage,
});

type Role = "viewer" | "editor" | "admin";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Can view campaigns, contacts, segments, messages, and inbox.",
  editor: "Viewer access. Per-feature editor permissions are rolling out.",
  admin: "Viewer access plus the ability to manage team members.",
};

function TeamPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyTeam);
  const inviteFn = useServerFn(inviteTeamMember);
  const updateFn = useServerFn(updateTeamMemberRole);
  const removeFn = useServerFn(removeTeamMember);

  const team = useQuery({ queryKey: ["team"], queryFn: () => listFn() });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  const inviteMut = useMutation({
    mutationFn: (input: { email: string; role: Role }) => inviteFn({ data: input }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setEmail("");
      setRole("viewer");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send invite"),
  });

  const updateMut = useMutation({
    mutationFn: (input: { memberId: string; role: Role }) => updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update role"),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) => removeFn({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <UserPlus className="size-6 text-primary" /> Team
        </h1>
        <p className="text-sm text-muted-foreground">
          Invite collaborators to your workspace. They'll log in with their own email and access
          your account based on the role you give them.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-2">
          <Mail className="size-4 text-primary" /> Invite someone
        </div>
        <form
          className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            inviteMut.mutate({ email: email.trim().toLowerCase(), role });
          }}
        >
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={inviteMut.isPending}>
            {inviteMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>Send invite</>
            )}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" /> Members
        </div>
        {team.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (team.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one's been invited yet. Send your first invite above.
          </p>
        ) : (
          <ul className="divide-y">
            {team.data!.map((m) => (
              <li key={m.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium">
                    {m.profile?.full_name || m.profile?.email || m.invited_email}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.invited_email}</div>
                </div>
                <Badge variant={m.status === "active" ? "default" : "secondary"}>
                  {m.status === "active" ? "Active" : "Invited"}
                </Badge>
                <Select
                  value={m.role}
                  onValueChange={(v) =>
                    updateMut.mutate({ memberId: m.id, role: v as Role })
                  }
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Remove member">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {m.invited_email} will lose access to your workspace immediately.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removeMut.mutate(m.id)}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
