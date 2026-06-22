import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Shield, ShieldCheck, Clock, X, ArrowRight } from "lucide-react";
import { getMyTollfreeVerification } from "@/lib/tollfree-verification.functions";
import { getGorgiasSettings, saveGorgiasSettings, disableGorgias } from "@/lib/gorgias.functions";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Settings — Xellvio" }] }),
  component: SettingsPage,
});

function TollfreeStatusCard() {
  const load = useServerFn(getMyTollfreeVerification);
  const { data, isLoading } = useQuery({
    queryKey: ["tollfree-verification"],
    queryFn: () => load(),
  });
  const asset = (data as any)?.asset ?? null;
  const status = asset?.verification_sid ? (asset?.verification_status as string | null) : null;

  let badge = (
    <Badge variant="outline" className="gap-1"><Clock className="size-3" /> Not started</Badge>
  );
  let blurb = "Required to send SMS to US and Canadian recipients. Skip if you only send elsewhere.";
  if (status === "verified") {
    badge = <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-500 text-white"><CheckCircle2 className="size-3" /> Approved</Badge>;
    blurb = `Your toll-free number ${asset?.phone_number ?? ""} is approved for US/Canada delivery.`;
  } else if (status === "rejected") {
    badge = <Badge variant="destructive" className="gap-1"><X className="size-3" /> Rejected</Badge>;
    blurb = asset?.friendly_rejection_reason ?? "Carrier rejected the submission — open to resubmit.";
  } else if (status === "in_review" || status === "submitted") {
    badge = <Badge className="gap-1 bg-blue-500 hover:bg-blue-500 text-white"><Clock className="size-3" /> In review</Badge>;
    blurb = "Carrier is reviewing your submission (typically 1–3 weeks).";
  }

  return (
    <Card className="p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="size-4" /> Toll-free verification (US/Canada)</h3>
        {isLoading ? <Badge variant="outline">Loading…</Badge> : badge}
      </div>
      <p className="text-sm text-muted-foreground">{blurb}</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/app/toll-free-verification">{status ? "Open verification" : "Start verification"} <ArrowRight className="size-3.5 ml-1" /></Link>
      </Button>
    </Card>
  );
}

function GorgiasCard() {
  return (
    <Card className="p-6 space-y-3 opacity-90">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold">Gorgias helpdesk</h3>
        <Badge variant="outline" className="gap-1"><Clock className="size-3" /> In progress</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        We're still building the Gorgias integration so SMS replies land as tickets automatically. It's not available yet — please check back soon. No setup is needed from you right now.
      </p>
      <Button disabled variant="outline">Coming soon</Button>
    </Card>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () =>
      (await supabase
        .from("accounts")
        .select("id,email,full_name,company,phone")
        .maybeSingle()).data,
  });
  const isAdmin = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => (await supabase.rpc("has_role", { _role: "admin" })).data === true,
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

      {isAdmin.data && (
        <Card className="p-6 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Shield className="size-4" /> Admin access</h3>
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" />
            You have admin privileges. Manage who else can be an admin from the User management page.
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/users">Manage users & roles</Link>
          </Button>
        </Card>
      )}

      <TollfreeStatusCard />
      <GorgiasCard />

      <Card className="p-6 space-y-3">
        <h3 className="font-semibold">SMS integration</h3>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          SMS API key connected.
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          Messaging Service SID is stored as a server-side secret. Sender selection is geo-matched automatically.
        </div>
        <p className="text-xs text-muted-foreground">
          Reminder: enable SMS Pumping Protection and review SMS Geo Permissions in your provider console before sending production traffic.
        </p>
      </Card>
    </div>
  );
}
