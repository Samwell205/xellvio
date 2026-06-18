import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Settings — Samwell Global SMS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: async () => (await supabase.from("profiles").select("*").maybeSingle()).data });
  const [form, setForm] = useState({ full_name: "", company: "", phone: "" });

  useEffect(() => {
    if (profile.data) setForm({ full_name: profile.data.full_name ?? "", company: profile.data.company ?? "", phone: profile.data.phone ?? "" });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(form).eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Profile saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-extrabold">Settings</h1><p className="text-sm text-muted-foreground">Profile and business info.</p></div>
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Profile</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={profile.data?.email ?? ""} disabled /></div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
      </Card>
      <Card className="p-6 space-y-3">
        <h3 className="font-semibold">Security</h3>
        <p className="text-sm text-muted-foreground">Reset your password via email link or enable two-factor authentication in the next update.</p>
        <Button variant="outline" onClick={async () => {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user?.email) return;
          await supabase.auth.resetPasswordForEmail(u.user.email, { redirectTo: window.location.origin + "/auth" });
          toast.success("Password reset email sent");
        }}>Send password reset email</Button>
      </Card>
    </div>
  );
}
