import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Loader2, MailCheck } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
  head: () => ({ meta: [{ title: "Verify email — SAMWELL SMS HUB" }] }),
  validateSearch: (search) => ({
    email: typeof search.email === "string" ? search.email : "",
    status: typeof search.status === "string" ? search.status : "unverified",
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email);
  const [loading, setLoading] = useState(false);

  async function resend() {
    if (!email) { toast.error("Enter your email first"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Verification email sent");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not resend verification email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md p-8 space-y-5">
        <Logo />
        <div className="space-y-2">
          <MailCheck className="size-9 text-primary" />
          <h1 className="text-2xl font-extrabold">Verify your email</h1>
          <p className="text-sm text-muted-foreground">Check your inbox for the verification email, then sign in to continue.</p>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={resend} disabled={loading}>{loading && <Loader2 className="size-4 mr-2 animate-spin" />}Resend verification email</Button>
          <Link to="/auth"><Button variant="outline" className="w-full">Back to sign in</Button></Link>
        </div>
      </Card>
    </div>
  );
}