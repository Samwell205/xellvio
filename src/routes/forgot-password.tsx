import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, MailCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — SAMWELL SMS HUB" },
      { name: "description", content: "Reset your SAMWELL SMS HUB password by email." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("If that email exists, we just sent a reset link.");
    } catch (err) {
      // Don't leak whether the email exists.
      setSent(true);
      toast.success("If that email exists, we just sent a reset link.");
      console.error("[forgot-password]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6"><Logo /></div>
        {sent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <MailCheck className="size-6" />
            </div>
            <h1 className="text-2xl font-extrabold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, you'll receive a password reset link in the next few minutes. Be sure to check your spam folder.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth" search={{ mode: "signin", redirect: "/app" }}>Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold">Forgot your password?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the email you signed up with and we'll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                Send reset link
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/auth" search={{ mode: "signin", redirect: "/app" }} className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
