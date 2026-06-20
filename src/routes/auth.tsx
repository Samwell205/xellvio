import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Xellvio" }, { name: "description", content: "Sign in or create your Xellvio account." }] }),
  validateSearch: (search) => ({
    mode: search.mode === "signup" ? "signup" : "signin",
    redirect: typeof search.redirect === "string" ? search.redirect : "/app",
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMode(search.mode);
    setErrorMsg(null);
  }, [search.mode]);

  const destination = search.redirect.startsWith("/") && !search.redirect.startsWith("//") ? search.redirect : "/app";
  const passwordMismatch = mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (mode === "signup") {
      if (!termsAccepted) {
        setErrorMsg("You must accept the Terms of Use to create an account.");
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
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + destination, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.user?.id) {
          await supabase.from("accounts").update({ terms_accepted_at: new Date().toISOString() }).eq("id", data.user.id);
        }
        if (data.session && data.user?.email_confirmed_at) {
          toast.success("Account created — welcome!");
          navigate({ href: destination });
        } else {
          toast.success("Account created! We sent a 6-digit verification code to your email — confirm it to finish signing up.");
          navigate({ to: "/verify-email", search: { email, status: "unverified" } });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes("not confirmed") || error.message.toLowerCase().includes("confirm")) {
            toast.message("Please verify your email to continue.");
            navigate({ to: "/verify-email", search: { email, status: "unverified" } });
            return;
          }
          throw error;
        }
        toast.success("Welcome back");
        navigate({ href: destination });
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Authentication failed";
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

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + destination });
      if (result.error) { toast.error(result.error.message ?? "Google sign-in failed"); return; }
      if (result.redirected) return;
      navigate({ href: destination });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex hero-gradient flex-col justify-between p-10">
        <Logo />
        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold tracking-tight">Reach customers <span className="text-gradient">worldwide.</span></h2>
          <p className="mt-4 text-muted-foreground">Send global SMS campaigns with confidence — fast, reliable, compliant.</p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} Xellvio</div>
      </div>
      <div className="flex items-center justify-center p-6 md:p-10">
        <Card className="w-full max-w-md p-8">
          <div className="md:hidden mb-6"><Logo /></div>
          <h1 className="text-2xl font-extrabold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue." : "Get 50 free credits to start."}
          </p>
          <Button variant="outline" className="w-full mt-6 gap-2" onClick={handleGoogle} disabled={loading} type="button">
            <GoogleIcon /> Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
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
              {mode === "signup" && <p className="text-xs text-muted-foreground">Use a unique password with 12+ characters, numbers, and symbols.</p>}
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
                    className={passwordMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                </div>
                {passwordMismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
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
                  <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Use</a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>.
                </span>
              </label>
            )}
            <Button type="submit" className="w-full" disabled={loading || passwordMismatch || (mode === "signup" && !termsAccepted)}>
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No account?" : "Have an account?"}{" "}
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-primary font-medium hover:underline">
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
    <svg className="size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
  );
}
