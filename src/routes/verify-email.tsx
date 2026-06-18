import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Logo } from "@/components/Logo";
import { Loader2, MailCheck, MailWarning, MailX, RefreshCw } from "lucide-react";

type Status = "unverified" | "verified" | "expired";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [
      { title: "Verify your email — Samwell Global SMS" },
      { name: "description", content: "Confirm your email address to activate your Samwell Global SMS account." },
    ],
  }),
  validateSearch: (search) => ({
    email: typeof search.email === "string" ? search.email : "",
    status: search.status === "verified" || search.status === "expired" ? (search.status as Status) : ("unverified" as Status),
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { email: initialEmail, status: initialStatus } = Route.useSearch();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>(initialStatus);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    // If already logged in & confirmed, send them to the app
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email_confirmed_at) {
        setStatus("verified");
      } else if (data.user?.email && !initialEmail) {
        setEmail(data.user.email);
      }
    });
  }, [initialEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || !email) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("expired") || msg.includes("invalid")) {
          setStatus("expired");
          toast.error("That code is invalid or expired. Request a new one below.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      setStatus("verified");
      toast.success("Email verified — welcome!");
      setTimeout(() => navigate({ to: "/app" }), 600);
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin + "/app" },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Verification email sent. Check your inbox (and spam folder).");
      setStatus("unverified");
      setCooldown(45);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-muted/30">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6"><Logo /></div>

        <StatusBanner status={status} email={email} />

        {status !== "verified" && (
          <form onSubmit={handleVerify} className="space-y-5 mt-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label>Enter the 6-digit code from your email</Label>
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs text-muted-foreground">
                Or click the confirmation link in the same email — both work.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={verifying || code.length !== 6 || !email}>
              {verifying && <Loader2 className="size-4 animate-spin mr-2" />}
              Verify email
            </Button>

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <p className="text-sm text-muted-foreground">Didn't get it?</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={resending || cooldown > 0 || !email}
              >
                {resending ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="size-4 mr-2" />
                )}
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
              </Button>
            </div>
          </form>
        )}

        {status === "verified" && (
          <div className="mt-6 space-y-3">
            <Button className="w-full" onClick={() => navigate({ to: "/app" })}>
              Continue to dashboard
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Wrong account?{" "}
          <Link to="/auth" className="text-primary font-medium hover:underline">
            Sign in with a different email
          </Link>
        </p>
      </Card>
    </div>
  );
}

function StatusBanner({ status, email }: { status: Status; email: string }) {
  if (status === "verified") {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 flex gap-3">
        <MailCheck className="size-5 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <h1 className="font-semibold text-emerald-700 dark:text-emerald-400">Email verified</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your account is active. You can now access your dashboard.
          </p>
        </div>
      </div>
    );
  }
  if (status === "expired") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
        <MailX className="size-5 text-destructive mt-0.5 shrink-0" />
        <div>
          <h1 className="font-semibold text-destructive">Verification code expired</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The code or link you used is no longer valid. Request a new verification email below
            and enter the 6-digit code we send to <span className="font-medium">{email || "your email"}</span>.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
      <MailWarning className="size-5 text-amber-600 mt-0.5 shrink-0" />
      <div>
        <h1 className="font-semibold text-amber-700 dark:text-amber-400">Verify your email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          We sent a 6-digit code and a confirmation link to{" "}
          <span className="font-medium text-foreground">{email || "your email"}</span>.
          Enter the code below — or click the link in the email — to activate your account.
        </p>
      </div>
    </div>
  );
}
