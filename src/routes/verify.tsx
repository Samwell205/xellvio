import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeCheck, Coins, ShieldCheck, Wallet } from "lucide-react";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Xellvio Verifier Marketplace — Earn by verifying toll-free numbers" },
      { name: "description", content: "Verify toll-free numbers and get paid every time one sells. Independent verifier portal." },
      { property: "og:title", content: "Xellvio Verifier Marketplace" },
      { property: "og:description", content: "Verify toll-free numbers and get paid every time one sells." },
    ],
  }),
  component: VerifyLanding,
});

function VerifyLanding() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-semibold text-lg">Xellvio</Link>
        <div className="flex items-center gap-3">
          <Link to="/verify/auth"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/verify/auth" search={{ tab: "signup" } as any}><Button>Become a verifier</Button></Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-16 space-y-16">
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary/80">
            <ShieldCheck className="size-4" /> Verifier Portal
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Get paid to verify toll-free numbers
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">
            Submit toll-free numbers, we verify them, and you earn every time
            a business buys one from the Xellvio pool. Cash out in Naira.
          </p>
          <Link to="/verify/auth" search={{ tab: "signup" } as any}>
            <Button size="lg">Create verifier account</Button>
          </Link>
        </section>

        <section className="grid md:grid-cols-3 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><BadgeCheck className="size-5 text-primary"/>Submit</CardTitle></CardHeader>
            <CardContent className="text-slate-400 text-sm">
              Send us toll-free numbers you can help get verified. Our team reviews and marks them verified.
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Coins className="size-5 text-primary"/>Earn</CardTitle></CardHeader>
            <CardContent className="text-slate-400 text-sm">
              When a tenant buys one of your verified numbers, we credit your wallet automatically (75% of the sale).
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Wallet className="size-5 text-primary"/>Cash out</CardTitle></CardHeader>
            <CardContent className="text-slate-400 text-sm">
              Request withdrawals to your Nigerian bank account. We pay out on request.
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
