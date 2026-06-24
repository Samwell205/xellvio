import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, UserPlus, Mail, Trash2, ShieldCheck, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMyTeam,
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from "@/lib/team.functions";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PRESETS,
  permissionsForPreset,
  type PermissionKey,
  type Permissions,
  type PresetId,
} from "@/lib/team-permissions";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({ meta: [{ title: "Team — Xellvio" }] }),
  component: TeamPage,
});

type Role = "viewer" | "editor" | "admin";

function roleFromPreset(id: PresetId): Role {
  if (id === "owner_admin") return "admin";
  if (id === "inbox_agent" || id === "analyst") return "viewer";
  return "editor";
}

function TeamPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyTeam);
  const inviteFn = useServerFn(inviteTeamMember);
  const updateFn = useServerFn(updateTeamMemberRole);
  const removeFn = useServerFn(removeTeamMember);

  const team = useQuery({ queryKey: ["team"], queryFn: () => listFn() });

  const [email, setEmail] = useState("");
  const [preset, setPreset] = useState<PresetId>("inbox_agent");
  const [perms, setPerms] = useState<Permissions>(() => permissionsForPreset("inbox_agent"));

  function applyPreset(id: PresetId) {
    setPreset(id);
    if (id !== "custom") setPerms(permissionsForPreset(id));
  }

  function togglePerm(k: PermissionKey, on: boolean) {
    setPreset("custom");
    setPerms((p) => ({ ...p, [k]: on }));
  }

  const inviteMut = useMutation({
    mutationFn: (input: { email: string; role: Role; permissions: Permissions }) =>
      inviteFn({ data: input }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setEmail("");
      applyPreset("inbox_agent");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send invite"),
  });

  const updateMut = useMutation({
    mutationFn: (input: { memberId: string; role: Role; permissions: Permissions }) =>
      updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Access updated");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update"),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) => removeFn({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const presetMeta = useMemo(() => PRESETS.find((p) => p.id === preset)!, [preset]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <UserPlus className="size-6 text-primary" /> Team
        </h1>
        <p className="text-sm text-muted-foreground">
          Invite collaborators and control exactly what they can access — inbox-only,
          campaigns-only, full admin, or a custom mix.
        </p>
      </div>

      <Card className="p-5 space-y-5">
        <div className="font-semibold flex items-center gap-2">
          <Mail className="size-4 text-primary" /> Invite someone
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            inviteMut.mutate({
              email: email.trim().toLowerCase(),
              role: roleFromPreset(preset),
              permissions: perms,
            });
          }}
        >
          <div className="grid sm:grid-cols-[1fr_240px] gap-3">
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
              <Label>Preset</Label>
              <Select value={preset} onValueChange={(v) => applyPreset(v as PresetId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{presetMeta.description}</p>

          <div className="rounded-md border p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Settings2 className="size-3.5" /> Areas this person can access
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {PERMISSION_KEYS.map((k) => (
                <label
                  key={k}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={!!perms[k]}
                    onCheckedChange={(v) => togglePerm(k, v === true)}
                  />
                  {PERMISSION_LABELS[k]}
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={inviteMut.isPending}>
            {inviteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Send invite"}
          </Button>
        </form>
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
              <MemberRow
                key={m.id}
                member={m}
                onSave={(permissions) =>
                  updateMut.mutate({
                    memberId: m.id,
                    role: m.role as Role,
                    permissions,
                  })
                }
                onRemove={() => removeMut.mutate(m.id)}
                saving={updateMut.isPending}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MemberRow({
  member,
  onSave,
  onRemove,
  saving,
}: {
  member: any;
  onSave: (perms: Permissions) => void;
  onRemove: () => void;
  saving: boolean;
}) {
  const initial: Permissions = (member.permissions as Permissions) ?? {};
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<Permissions>(initial);
  const granted = PERMISSION_KEYS.filter((k) => initial[k]);

  return (
    <li className="py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-medium">
            {member.profile?.full_name || member.profile?.email || member.invited_email}
          </div>
          <div className="text-xs text-muted-foreground">{member.invited_email}</div>
        </div>
        <Badge variant={member.status === "active" ? "default" : "secondary"}>
          {member.status === "active" ? "Active" : "Invited"}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Manage access"}
        </Button>
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
                {member.invited_email} will lose access to your workspace immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {granted.length > 0 && !open && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {granted.map((k) => (
            <Badge key={k} variant="outline" className="text-xs">
              {PERMISSION_LABELS[k]}
            </Badge>
          ))}
        </div>
      )}

      {open && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <div className="grid sm:grid-cols-2 gap-2">
            {PERMISSION_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={!!perms[k]}
                  onCheckedChange={(v) =>
                    setPerms((p) => ({ ...p, [k]: v === true }))
                  }
                />
                {PERMISSION_LABELS[k]}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSave(perms)} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save access"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPerms(initial)}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
