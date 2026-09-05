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
import {
  CheckCircle2,
  AlertTriangle,
  Shield,
  ShieldCheck,
  Clock,
  X,
  ArrowRight,
  KeyRound,
  Mail,
  User,
} from "lucide-react";
import { getMyTollfreeVerification } from "@/lib/tollfree-verification.functions";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Xellvio" },
      {
        name: "description",
        content: "Manage your Xellvio profile, login email, password and SMS sender settings.",
      },
      { property: "og:title", content: "Settings — Xellvio" },
      {
        property: "og:description",
        content: "Manage your Xellvio profile, login email, password and SMS sender settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Tab = "personal" | "account" | "security" | "messaging";

const TABS: { id: Tab; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "messaging", label: "Messaging" },
];

function TollfreeStatusCard() {
  const load = useServerFn(getMyTollfreeVerification);
  const { data, isLoading } = useQuery({
    queryKey: ["tollfree-verification"],
    queryFn: () => load(),
  });
  const asset = (data as any)?.asset ?? null;
  const alt = (data as any)?.altVerifiedSender ?? null;
  const status = asset?.telnyx_verification_id
    ? (asset?.verification_status as string | null)
    : null;

  let badge = (
    <Badge variant="outline" className="gap-1">
      <Clock className="size-3" /> Not started
    </Badge>
  );
  let blurb =
    "Required to send SMS to US and Canadian recipients. Skip if you only send elsewhere.";
  if (status === "verified" || alt) {
    badge = (
      <Badge className="gap-1 bg-emerald-500 text-white hover:bg-emerald-500">
        <CheckCircle2 className="size-3" /> Approved
      </Badge>
    );
    blurb = `Your number ${asset?.phone_number ?? alt?.phone_number ?? ""} is approved for US/Canada delivery.`;
  } else if (status === "rejected") {
    badge = (
      <Badge variant="destructive" className="gap-1">
        <X className="size-3" /> Rejected
      </Badge>
    );
    blurb =
      asset?.friendly_rejection_reason ?? "Carrier rejected the submission — open to resubmit.";
  } else if (status === "in_review" || status === "submitted") {
    badge = (
      <Badge className="gap-1 bg-blue-500 text-white hover:bg-blue-500">
        <Clock className="size-3" /> In review
      </Badge>
    );
    blurb = "Carrier is reviewing your submission (typically 1–3 weeks).";
  }

  return (
    <Card className="space-y-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4" /> Toll-free verification (US/Canada)
        </h3>
        {isLoading ? <Badge variant="outline">Loading…</Badge> : badge}
      </div>
      <p className="text-sm text-muted-foreground">{blurb}</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/app/toll-free-verification">
          {status ? "Open verification" : "Start verification"}{" "}
          <ArrowRight className="ml-1 size-3.5" />
        </Link>
      </Button>
    </Card>
  );
}

function LoginEmailCard({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  useEffect(() => setEmail(currentEmail), [currentEmail]);
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: `${window.location.origin}/app/settings` },
      );
      if (error) throw error;
    },
    onSuccess: () => toast.success("Check your new inbox — we sent a confirmation link."),
    onError: (e: any) => toast.error(e.message ?? "Could not change email"),
  });

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4" /> Login email
        </h3>
        <p className="text-sm text-muted-foreground">
          This is the email you sign in with. We will ask you to confirm the new address.
        </p>
      </div>
      <div className="max-w-md space-y-1.5">
        <Label>Email address</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button
        disabled={!email.trim() || email.trim() === currentEmail || change.isPending}
        onClick={() => change.mutate()}
      >
        {change.isPending ? "Sending…" : "Update email"}
      </Button>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: async () => {
      if (next.length < 8) throw new Error("Use at least 8 characters.");
      if (next !== confirm) throw new Error("The new passwords do not match.");
      const { error } = await supabase.auth.updateUser({
        password: next,
        current_password: current,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update password"),
  });

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" /> Login password
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose something at least 8 characters long that you do not use elsewhere.
        </p>
      </div>
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Current password</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm new password</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!current || !next || !confirm || change.isPending}
          onClick={() => change.mutate()}
        >
          {change.isPending ? "Saving…" : "Update password"}
        </Button>
        <Link to="/forgot-password" className="text-sm text-muted-foreground underline">
          Forgot your current password?
        </Link>
      </div>
    </Card>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("personal");
  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () =>
      (
        await supabase
          .from("accounts")
          .select("id,email,contact_email,full_name,company,phone")
          .maybeSingle()
      ).data,
  });
  const isAdmin = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => (await supabase.rpc("has_role", { _role: "admin" })).data === true,
  });
  const [form, setForm] = useState({ full_name: "", company: "", phone: "" });

  useEffect(() => {
    if (account.data)
      setForm({
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your profile, sign-in details and sending setup.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
              tab === t.id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "personal" && (
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 font-semibold">
                <User className="size-4" /> Your details
              </h3>
              <p className="text-sm text-muted-foreground">
                Used on invoices and in the messages we send you.
              </p>
            </div>
            <div className="grid max-w-2xl gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Login email</Label>
                <Input value={account.data?.email ?? ""} disabled />
              </div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </Card>
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-6">
          <Card className="space-y-3 p-6">
            <h3 className="font-semibold">Workspace</h3>
            <p className="text-sm text-muted-foreground">
              Invite teammates and choose exactly what each person can open.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/app/team">Manage team</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/app/billing">Billing &amp; credits</Link>
              </Button>
            </div>
          </Card>
          {isAdmin.data && (
            <Card className="space-y-3 p-6">
              <h3 className="flex items-center gap-2 font-semibold">
                <Shield className="size-4" /> Admin access
              </h3>
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" />
                You have admin privileges.
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/users">Manage users &amp; roles</Link>
              </Button>
            </Card>
          )}
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-6">
          <LoginEmailCard currentEmail={account.data?.email ?? ""} />
          <PasswordCard />
        </div>
      )}

      {tab === "messaging" && (
        <div className="space-y-6">
          <TollfreeStatusCard />
          <Card className="space-y-3 p-6">
            <h3 className="font-semibold">SMS sending</h3>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-success" /> Sending connection active.
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-warning" />
              Your sender is matched to each recipient's country automatically.
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/setup-sms">Open SMS setup</Link>
            </Button>
          </Card>
          <Card className="space-y-3 p-6 opacity-90">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Gorgias helpdesk</h3>
              <Badge variant="outline" className="gap-1">
                <Clock className="size-3" /> Coming soon
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Replies will land as helpdesk tickets automatically. Nothing to set up yet.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
