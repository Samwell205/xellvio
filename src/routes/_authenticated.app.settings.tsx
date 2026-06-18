import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Settings — Samwell Global SMS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () => (await supabase.from("accounts").select("*").maybeSingle()).data,
  });
  const [form, setForm] = useState({ full_name: "", company: "", phone: "" });

  useEffect(() => {
    if (account.data) setForm({
      full_name: account.data.full_name ?? "",
      company: account.data.company ?? "",
      phone: account.data.phone ?? "",
    });
  }, [account.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("accounts").update(form).eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["account"] }); toast.success("Account saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-sm text-muted-foreground">Account and integration status.</p>
      </div>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Account</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={account.data?.email ?? ""} disabled /></div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="font-semibold">Twilio integration</h3>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          Twilio API key connected (via Lovable connector).
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          Messaging Service SID is stored as a server-side secret. Sender selection is geo-matched automatically by Twilio.
        </div>
        <p className="text-xs text-muted-foreground">
          Reminder: enable SMS Pumping Protection and review SMS Geo Permissions in the Twilio console before sending production traffic.
        </p>
      </Card>
    </div>
  );
}
