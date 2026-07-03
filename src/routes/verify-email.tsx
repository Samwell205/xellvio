import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/verify-email")({
  head: () => ({ meta: [{ title: "Verify email — Xellvio" }] }),
  validateSearch: (search) => ({
    email: typeof search.email === "string" ? search.email : "",
    status: typeof search.status === "string" ? search.status : "unverified",
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const search = Route.useSearch();
  const email = search.email;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md p-8 space-y-5">
        <Logo />
        <div className="space-y-2">
          <MailCheck className="size-9 text-primary" />
          <h1 className="text-2xl font-extrabold">Verify your email</h1>
          <p className="text-sm text-muted-foreground">Create your account from the signup page to receive a 6-digit verification code.</p>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} readOnly type="email" placeholder="you@example.com" />
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/auth" search={{ mode: "signup", redirect: "/app" }}><Button className="w-full">Create account</Button></Link>
          <Link to="/auth"><Button variant="outline" className="w-full">Back to sign in</Button></Link>
        </div>
      </Card>
    </div>
  );
}