import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/verify/auth")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ tab: z.enum(["signin","signup"]).optional() }).parse(s),
  component: VerifierAuth,
});

function VerifierAuth() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function doSignIn() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signinEmail, password: signinPassword,
      });
      if (error) throw error;
      navigate({ to: "/verify/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Sign in failed");
    } finally { setBusy(false); }
  }

  async function doSignUp() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: { full_name: signupName, verifier_signup: true },
          emailRedirectTo: `${window.location.origin}/verify/dashboard`,
        },
      });
      if (error) throw error;
      toast.success("Account created — check your email to confirm, then sign in.");
    } catch (e: any) {
      toast.error(e.message ?? "Sign up failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/verify" className="text-sm text-slate-400 hover:text-slate-200">← Verifier portal</Link>
          <h1 className="text-2xl font-semibold mt-2">Xellvio Verifier</h1>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-6">
            <Tabs defaultValue={tab ?? "signin"}>
              <TabsList className="grid w-full grid-cols-2 bg-slate-800">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 pt-4">
                <div><Label>Email</Label><Input type="email" value={signinEmail} onChange={e=>setSigninEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" value={signinPassword} onChange={e=>setSigninPassword(e.target.value)} /></div>
                <Button className="w-full" disabled={busy} onClick={doSignIn}>Sign in</Button>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 pt-4">
                <div><Label>Full name</Label><Input value={signupName} onChange={e=>setSignupName(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" value={signupEmail} onChange={e=>setSignupEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" value={signupPassword} onChange={e=>setSignupPassword(e.target.value)} /></div>
                <Button className="w-full" disabled={busy || !signupName} onClick={doSignUp}>Create verifier account</Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
