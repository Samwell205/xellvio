import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify/reset-password")({
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and fires a PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check existing session (link already consumed on this page load).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function updatePassword() {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated — you're signed in.");
      navigate({ to: "/verify/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dark grid min-h-screen place-items-center bg-slate-950 px-6 py-12 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/verify/auth" className="text-sm text-slate-400 hover:text-slate-200">← Back to sign in</Link>
          <h1 className="mt-2 text-2xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-400">Choose a new password for your Xellvio account.</p>
        </div>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="space-y-3 pt-6">
            {!ready ? (
              <p className="text-sm text-slate-400">
                Waiting for reset link… If you landed here directly, please use the link from your email.
              </p>
            ) : (
              <>
                <div>
                  <Label>New password</Label>
                  <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
                </div>
                <div>
                  <Label>Confirm new password</Label>
                  <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
                </div>
                <Button className="w-full" disabled={busy || !password || !confirm} onClick={updatePassword}>
                  {busy ? "Updating…" : "Update password"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
