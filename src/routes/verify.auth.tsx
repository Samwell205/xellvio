import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";
import { checkVerifierEmailAvailable } from "@/lib/verifier.functions";

export const Route = createFileRoute("/verify/auth")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ tab: z.enum(["signin", "signup"]).optional() }).parse(s),
  component: VerifierAuth,
});

function VerifierAuth() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

  // Sign in (magic-link OTP)
  const [signinEmail, setSigninEmail] = useState("");
  const [signinStage, setSigninStage] = useState<"email" | "code">("email");
  const [signinCode, setSigninCode] = useState("");

  // Sign up: name + email -> code -> account created
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupStage, setSignupStage] = useState<"details" | "code">("details");
  const [signupCode, setSignupCode] = useState("");

  const [busy, setBusy] = useState(false);

  async function sendSigninCode() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: signinEmail,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setSigninStage("code");
      toast.success("We sent a 6-digit code to your email");
    } catch (e: any) {
      toast.error(e.message ?? "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verifySigninCode() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: signinEmail,
        token: signinCode.trim(),
        type: "email",
      });
      if (error) throw error;
      navigate({ to: "/verify/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function sendSignupCode() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: signupEmail,
        options: {
          shouldCreateUser: true,
          data: { full_name: signupName, verifier_signup: true },
        },
      });
      if (error) throw error;
      setSignupStage("code");
      toast.success("We sent a 6-digit code to your email");
    } catch (e: any) {
      toast.error(e.message ?? "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verifySignupCode() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: signupEmail,
        token: signupCode.trim(),
        type: "email",
      });
      if (error) throw error;
      toast.success("Email confirmed — welcome!");
      navigate({ to: "/verify/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/verify" className="text-sm text-slate-400 hover:text-slate-200">← Verifier portal</Link>
          <h1 className="text-2xl font-semibold mt-2">Xellvio Verifier</h1>
          <p className="text-sm text-slate-400 mt-1">Passwordless — we email you a 6-digit code.</p>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-6">
            <Tabs defaultValue={tab ?? "signin"}>
              <TabsList className="grid w-full grid-cols-2 bg-slate-800">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-3 pt-4">
                {signinStage === "email" ? (
                  <>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={signinEmail} onChange={(e) => setSigninEmail(e.target.value)} placeholder="you@example.com" />
                    </div>
                    <Button className="w-full" disabled={busy || !signinEmail} onClick={sendSigninCode}>
                      {busy ? "Sending…" : "Email me a code"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-slate-400">Code sent to <span className="text-slate-200">{signinEmail}</span></div>
                    <div>
                      <Label>6-digit code</Label>
                      <Input inputMode="numeric" maxLength={6} value={signinCode} onChange={(e) => setSigninCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
                    </div>
                    <Button className="w-full" disabled={busy || signinCode.length !== 6} onClick={verifySigninCode}>
                      {busy ? "Verifying…" : "Verify & sign in"}
                    </Button>
                    <button type="button" className="text-xs text-slate-400 hover:text-slate-200 underline" onClick={() => { setSigninStage("email"); setSigninCode(""); }}>
                      Use a different email
                    </button>
                  </>
                )}
              </TabsContent>

              <TabsContent value="signup" className="space-y-3 pt-4">
                {signupStage === "details" ? (
                  <>
                    <div>
                      <Label>Full name</Label>
                      <Input value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Jane Doe" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="you@example.com" />
                    </div>
                    <Button className="w-full" disabled={busy || !signupName || !signupEmail} onClick={sendSignupCode}>
                      {busy ? "Sending…" : "Send verification code"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-slate-400">Code sent to <span className="text-slate-200">{signupEmail}</span></div>
                    <div>
                      <Label>6-digit code</Label>
                      <Input inputMode="numeric" maxLength={6} value={signupCode} onChange={(e) => setSignupCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
                    </div>
                    <Button className="w-full" disabled={busy || signupCode.length !== 6} onClick={verifySignupCode}>
                      {busy ? "Creating account…" : "Confirm & create account"}
                    </Button>
                    <button type="button" className="text-xs text-slate-400 hover:text-slate-200 underline" onClick={() => { setSignupStage("details"); setSignupCode(""); }}>
                      Edit details
                    </button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
