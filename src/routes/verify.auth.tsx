import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { createVerifierAccountWithCode, sendVerifierSignupCode } from "@/lib/verifier.functions";

export const Route = createFileRoute("/verify/auth")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ tab: z.enum(["signin", "signup"]).optional() }).parse(s),
  component: VerifierAuth,
});

function VerifierAuth() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const sendCode = useServerFn(sendVerifierSignupCode);
  const createAccount = useServerFn(createVerifierAccountWithCode);

  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupStage, setSignupStage] = useState<"details" | "code">("details");
  const [signupCode, setSignupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  async function sendResetEmail() {
    if (!forgotEmail) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/verify/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your email.");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signinEmail,
        password: signinPassword,
      });
      if (error) throw error;
      navigate({ to: "/verify/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Invalid email or password");
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    setBusy(true);
    try {
      if (signupPassword.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }
      if (signupPassword !== signupPasswordConfirm) {
        toast.error("Passwords do not match.");
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: { data: { full_name: signupName } },
      });
      if (signUpError) throw signUpError;
      const { error } = await supabase.auth.signInWithPassword({
        email: signupEmail,
        password: signupPassword,
      });
      if (error) throw error;
      toast.success("Welcome!");
      navigate({ to: "/verify/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="dark grid min-h-screen place-items-center bg-slate-950 px-6 py-12 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/verify" className="text-sm text-slate-400 hover:text-slate-200">← Verifier portal</Link>
          <h1 className="mt-2 text-2xl font-semibold">Xellvio Verifier</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in with email and password. New accounts confirm by code once.</p>
        </div>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="pt-6">
            <Tabs defaultValue={tab ?? "signin"}>
              <TabsList className="grid w-full grid-cols-2 bg-slate-800">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-3 pt-4">
                <div>
                  <Label>Email</Label>
                  <Input type="email" autoComplete="email" value={signinEmail} onChange={(e) => setSigninEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" autoComplete="current-password" value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} placeholder="Enter your password" />
                </div>
                <Button className="w-full" disabled={busy || !signinEmail || !signinPassword} onClick={signInWithPassword}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
                {!forgotOpen ? (
                  <button
                    type="button"
                    className="text-xs text-slate-400 underline hover:text-slate-200"
                    onClick={() => { setForgotOpen(true); setForgotEmail(signinEmail); }}
                  >
                    Forgot password?
                  </button>
                ) : (
                  <div className="space-y-2 rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <Label className="text-xs text-slate-300">Reset password — enter your email</Label>
                    <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@example.com" />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" disabled={busy || !forgotEmail} onClick={sendResetEmail}>
                        {busy ? "Sending…" : "Send reset link"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setForgotOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="signup" className="space-y-3 pt-4">
                <div>
                  <Label>Full name</Label>
                  <Input value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" autoComplete="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" autoComplete="new-password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Minimum 8 characters" />
                </div>
                <div>
                  <Label>Confirm password</Label>
                  <Input type="password" autoComplete="new-password" value={signupPasswordConfirm} onChange={(e) => setSignupPasswordConfirm(e.target.value)} placeholder="Repeat password" />
                </div>
                <Button className="w-full" disabled={busy || !signupName || !signupEmail || !signupPassword || !signupPasswordConfirm} onClick={signUp}>
                  {busy ? "Creating account…" : "Create account"}
                </Button>
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
