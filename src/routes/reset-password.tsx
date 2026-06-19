import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SAMWELL SMS HUB" },
      { name: "description", content: "Set a new password for your SAMWELL SMS HUB account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Supabase fires PASSWORD_RECOVERY when the recovery link's tokens are processed.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Fallback: if a session already exists from the recovery link.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    // If the hash has no recovery token at all, mark invalid after a short delay.
    const t = window.setTimeout(() => {
      if (!ready && !window.location.hash.includes("access_token") && !window.location.hash.includes("type=recovery")) {
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) setInvalidLink(true);
        });
      }
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, [ready]);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/app" });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Failed to update password";
      const lower = rawMessage.toLowerCase();
      const message = lower.includes("weak") || lower.includes("pwned") || lower.includes("breach") || lower.includes("compromis")
        ? "This password has appeared in a known data breach. Please pick a different, unique password (12+ characters with numbers and symbols)."
        : rawMessage;
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6"><Logo /></div>
        <h1 className="text-2xl font-extrabold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a strong password you haven't used before.
        </p>

        {invalidLink ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              This reset link is invalid or has expired. Please request a new one.
            </div>
            <Button asChild className="w-full">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {errorMsg && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10"
                  disabled={!ready}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Use 12+ characters with numbers and symbols.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={passwordMismatch}
                className={passwordMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
                disabled={!ready}
              />
              {passwordMismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready || passwordMismatch}>
              {(loading || !ready) && <Loader2 className="size-4 animate-spin mr-2" />}
              {ready ? "Update password" : "Verifying link…"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
