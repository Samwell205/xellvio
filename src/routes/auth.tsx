import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, Eye, EyeOff } from "lucide-react";
import loginGlobeAsset from "@/assets/xellvio-login-globe.mp4.asset.json";
import loginGlobeWebmAsset from "@/assets/xellvio-login-globe.webm.asset.json";
import { withAuthRetry, friendlyAuthError, clearStaleSession } from "@/lib/auth-retry";
import { pageHead } from "@/lib/seo";
import { trackProduct } from "@/lib/growth/track";
import { authCooldownSeconds, EMAIL_CONFIRMATION_MESSAGE, EXISTING_ACCOUNT_MESSAGE, signupEmailAlreadyRegistered, signupNeedsConfirmation } from "@/lib/signup-flow";

export const Route = createFileRoute("/auth")({
  head: () =>
    pageHead({
      path: "/auth",
      title: "Sign in",
      description: "Sign in or create your Xellvio account.",
      robots: "noindex",
      image: null,
    }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode?: "signin" | "signup"; redirect?: string; invite?: string } => ({
    mode: search.mode === "signup" ? "signup" : "signin",
    redirect: typeof search.redirect === "string" ? search.redirect : "/app",
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    const update = () => setRetrySeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    setMode(search.mode ?? "signin");
    const params = new URLSearchParams(window.location.search);
    if (params.has("error") || params.has("error_description")) {
      setErrorMsg("That sign-in link could not be completed. Try Google again, or sign in with your email and password.");
    } else {
      setErrorMsg(null);
    }
  }, [search.mode]);

  useEffect(() => {
    if (search.invite) setEmail(search.invite.trim().toLowerCase());
  }, [search.invite]);

  const redirectTarget = search.redirect ?? "/app";
  const destination =
    redirectTarget.startsWith("/") && !redirectTarget.startsWith("//") ? redirectTarget : "/app";
  const passwordMismatch =
    mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || Date.now() < retryAt) return;
    setErrorMsg(null);
    if (mode === "signup") {
      if (!termsAccepted) {
        setErrorMsg(
          "You must accept the Terms of Service, Acceptable Use Policy, Anti-Spam Policy, and Privacy Policy to create an account.",
        );
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("Passwords do not match.");
        return;
      }
      if (password.length < 8) {
        setErrorMsg("Password must be at least 8 characters.");
        return;
      }
    }
    submitting.current = true;
    setLoading(true);
    try {
      // A locally stored session with a dead refresh token makes supabase-js fire
      // failing refresh calls that surface as "Failed to fetch" during sign-in.
      await clearStaleSession();
      if (mode === "signup") {
        // Signup sends an email: never automatically repeat an ambiguous request.
        const { data: signupData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: name },
              emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(destination)}`,
            },
          });
        if (signUpError) throw signUpError;
        if (signupEmailAlreadyRegistered(signupData)) {
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
          setErrorMsg(EXISTING_ACCOUNT_MESSAGE);
          return;
        }
        if (signupNeedsConfirmation(signupData)) {
          setConfirmationEmail(email.trim());
          setRetryAt(Date.now() + 60_000);
          setPassword("");
          setConfirmPassword("");
          return;
        }
        // Ensure the accounts row exists BEFORE recording ToS acceptance —
        // otherwise the accounts.update in acceptTos matches 0 rows and the
        // re-acceptance modal fires immediately for brand-new signups.
        try {
          const { ensureMyAccount } = await import("@/lib/account.functions");
          await ensureMyAccount();
          const { acceptTos } = await import("@/lib/tos.functions");
          await acceptTos({ data: { userAgent: navigator.userAgent.slice(0, 500) } });
        } catch {
          /* modal will re-prompt if it failed */
        }
        trackProduct("signup_completed");
        trackProduct("workspace_created");
        toast.success("Account created — welcome!");
        navigate({ href: destination });
      } else {
        const { error } = await withAuthRetry(() =>
          supabase.auth.signInWithPassword({ email, password }),
        );
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ href: destination });
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (mode === "signin" && (e?.code === "email_not_confirmed" || /email not confirmed/i.test(e?.message ?? ""))) {
        setConfirmationEmail(email.trim());
        setPassword("");
        return;
      }
      const seconds = authCooldownSeconds(err);
      if (seconds) setRetryAt(Date.now() + seconds * 1000);
      const message = friendlyAuthError(err);
      setErrorMsg(message);
      toast.error(message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!confirmationEmail || submitting.current || Date.now() < retryAt) return;
    submitting.current = true;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup", email: confirmationEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(destination)}` },
      });
      if (error) throw error;
      setRetryAt(Date.now() + 60_000);
      toast.success("Confirmation email sent. Check your inbox and spam folder.");
    } catch (error) {
      const seconds = authCooldownSeconds(error);
      if (seconds) setRetryAt(Date.now() + seconds * 1000);
      setErrorMsg(friendlyAuthError(error));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmationEmail || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: confirmationEmail, token: otp, type: "signup" });
      if (error) throw error;
      try {
        const { ensureMyAccount } = await import("@/lib/account.functions");
        await ensureMyAccount();
        const { acceptTos } = await import("@/lib/tos.functions");
        await acceptTos({ data: { userAgent: navigator.userAgent.slice(0, 500) } });
      } catch {
        /* modal will re-prompt if it failed */
      }
      trackProduct("signup_completed");
      toast.success("Email confirmed — welcome!");
      navigate({ href: destination });
    } catch (err) {
      setErrorMsg("That code is wrong or has expired. Check the latest email or tap Resend code.");
      void err;
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      try {
        sessionStorage.setItem("post_auth_redirect", destination);
      } catch {}
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      toast.success("Welcome");
      navigate({ href: destination });
    } finally {
      setLoading(false);
    }
  }

  // After returning from Google, send the signed-in user on to their page.
  useEffect(() => {
    let done = false;
    const go = (hasSession: boolean) => {
      if (!hasSession || done) return;
      let target: string | null = null;
      try {
        target = sessionStorage.getItem("post_auth_redirect");
        sessionStorage.removeItem("post_auth_redirect");
      } catch {}
      if (!target) return;
      done = true;
      const safe = target.startsWith("/") && !target.startsWith("//") ? target : "/app";
      navigate({ href: safe });
    };
    supabase.auth.getSession().then(({ data }) => go(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => go(!!s));
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="relative hidden overflow-hidden hero-gradient md:block" aria-hidden="true">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="pointer-events-none absolute left-1/2 top-1/2 w-[88%] max-h-full -translate-x-1/2 -translate-y-1/2 object-contain"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent), linear-gradient(to bottom, transparent, black 28px, black calc(100% - 28px), transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent), linear-gradient(to bottom, transparent, black 28px, black calc(100% - 28px), transparent)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
          <source src={loginGlobeAsset.url} type="video/mp4" />
          <source src={loginGlobeWebmAsset.url} type="video/webm" />
        </video>
      </div>
      <div className="flex flex-col items-center justify-center p-6 md:p-10">
        <div className="md:hidden relative mb-6 h-56 w-full overflow-hidden rounded-2xl" aria-hidden="true">
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center 95%" }}
          >
            <source src={loginGlobeAsset.url} type="video/mp4" />
            <source src={loginGlobeWebmAsset.url} type="video/webm" />
          </video>
        </div>
        <Card className="w-full max-w-md p-8">
          <div className="md:hidden mb-6">
            <Logo />
          </div>
          <h1 className="text-2xl font-extrabold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue." : "Get 50 free credits to start."}
          </p>
          {search.invite && (
            <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              You have a business invite for{" "}
              <span className="font-medium text-foreground">{search.invite}</span>. Sign in or
              create an account with this email to accept it.
            </div>
          )}
          <Button
            variant="outline"
            className="w-full mt-6 gap-2"
            onClick={handleGoogle}
            disabled={loading}
            type="button"
          >
            <GoogleIcon /> Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          {confirmationEmail ? (
            <div className="space-y-4" role="status">
              <h2 className="font-semibold">Confirm your email</h2>
              <p className="text-sm text-muted-foreground">{EMAIL_CONFIRMATION_MESSAGE}</p>
              <p className="text-sm break-all">{confirmationEmail}</p>
              <form onSubmit={verifyCode} className="space-y-2">
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter the code from the email"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
                <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}Verify and continue
                </Button>
              </form>
              {errorMsg && <p role="alert" className="text-sm text-destructive">{errorMsg}</p>}
              <Button variant="outline" className="w-full" onClick={resendConfirmation} disabled={loading || retrySeconds > 0}>
                {retrySeconds > 0 ? `Resend code in ${retrySeconds}s` : "Resend code"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setConfirmationEmail(null); setMode("signin"); setErrorMsg(null); }}>
                Back to sign in
              </Button>
            </div>
          ) : <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "signup" ? 8 : 6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="pr-10"
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
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">
                  Use a unique password with 12+ characters, numbers, and symbols.
                </p>
              )}
            </div>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={passwordMismatch}
                    className={
                      passwordMismatch ? "border-destructive focus-visible:ring-destructive" : ""
                    }
                  />
                </div>
                {passwordMismatch && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>
            )}
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border accent-primary"
                  required
                />
                <span className="text-muted-foreground">
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Terms of Service
                  </a>
                  ,{" "}
                  <a
                    href="/aup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Acceptable Use Policy
                  </a>
                  ,{" "}
                  <a
                    href="/anti-spam"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Anti-Spam Policy
                  </a>
                  , and{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || retrySeconds > 0 || passwordMismatch || (mode === "signup" && !termsAccepted)}
            >
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              {retrySeconds > 0 ? `Try again in ${retrySeconds}s` : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No account?" : "Have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setConfirmationEmail(null);
                setErrorMsg(null);
              }}
              className="text-primary font-medium hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
