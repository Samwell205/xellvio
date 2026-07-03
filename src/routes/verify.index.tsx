import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BadgeCheck,
  Coins,
  ShieldCheck,
  Wallet,
  PhoneCall,
  Upload,
  CheckCircle2,
  Banknote,
  Clock,
  Globe2,
  Users,
  TrendingUp,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/verify/")({
  head: () => ({
    meta: [
      { title: "Xellvio Verifier Marketplace — Earn by verifying toll-free numbers" },
      {
        name: "description",
        content:
          "Submit toll-free numbers, we verify them, and you earn every time a business buys one from the Xellvio pool. Cash out in Naira.",
      },
      { property: "og:title", content: "Xellvio Verifier Marketplace" },
      {
        property: "og:description",
        content: "Get paid to verify toll-free numbers. Independent verifier portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyLanding,
});

function VerifyLanding() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-semibold text-lg">
          Xellvio
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/verify/auth">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/verify/auth" search={{ tab: "signup" } as never}>
            <Button>Become a verifier</Button>
          </Link>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center space-y-6">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary/80">
            <ShieldCheck className="size-4" /> Verifier Portal
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Get paid to verify toll-free numbers
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">
            Submit toll-free numbers, we verify them, and you earn every time a
            business buys one from the Xellvio pool. Cash out in Naira, straight
            to your Nigerian bank account.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link to="/verify/auth" search={{ tab: "signup" } as never}>
              <Button size="lg">Create verifier account</Button>
            </Link>
            <Link to="/verify/auth">
              <Button size="lg" variant="outline" className="border-white bg-white text-slate-950 hover:bg-slate-200 hover:text-slate-950">
                I already have an account
              </Button>
            </Link>
          </div>
          <div className="pt-6 flex items-center justify-center gap-6 text-xs text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5 text-emerald-400"/> Free to join</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5 text-emerald-400"/> 75% commission per sale</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5 text-emerald-400"/> Paid in NGN</span>
          </div>
        </section>

        {/* STATS */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: "Commission per sale", value: "75%" },
              { label: "Minimum withdrawal", value: "₦5,000" },
              { label: "Typical payout time", value: "24–48 hrs" },
            ].map((s) => (
              <Card key={s.label} className="bg-slate-900/60 border-slate-800">
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold text-primary">{s.value}</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-y border-slate-800/60 bg-slate-900/30">
          <div className="max-w-5xl mx-auto px-6 py-20 space-y-10">
            <div className="text-center space-y-3">
              <div className="text-xs uppercase tracking-widest text-primary/80">How it works</div>
              <h2 className="text-3xl md:text-4xl font-bold">Three steps to your first payout</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  n: 1,
                  icon: Upload,
                  title: "Submit toll-free numbers",
                  body: "Add toll-free numbers you can help get verified. You can submit as many as you can source — no limit.",
                },
                {
                  n: 2,
                  icon: BadgeCheck,
                  title: "We verify & list them",
                  body: "Our team reviews each number and marks it verified. Verified numbers land in the Xellvio marketplace pool.",
                },
                {
                  n: 3,
                  icon: Banknote,
                  title: "You earn on every sale",
                  body: "When a business buys one of your verified numbers, 75% of the sale is credited to your wallet automatically.",
                },
              ].map((s) => (
                <Card key={s.n} className="bg-slate-900 border-slate-800 relative overflow-hidden">
                  <div className="absolute top-4 right-4 text-6xl font-bold text-slate-800/60">{s.n}</div>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                      <s.icon className="size-5 text-primary" />
                      {s.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-slate-400 text-sm">{s.body}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* EARNINGS EXAMPLE */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="text-xs uppercase tracking-widest text-primary/80">Earnings</div>
              <h2 className="text-3xl md:text-4xl font-bold">What can you actually make?</h2>
              <p className="text-slate-400">
                Every verified toll-free number sits in the marketplace ready to
                be bought by a tenant. When a sale closes, you keep 75% and
                Xellvio keeps 25% to cover platform, carrier and payout costs.
              </p>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex gap-2"><CheckCircle2 className="size-4 text-emerald-400 mt-0.5"/> No cap on how many numbers you submit</li>
                <li className="flex gap-2"><CheckCircle2 className="size-4 text-emerald-400 mt-0.5"/> Earnings visible in real time on your dashboard</li>
                <li className="flex gap-2"><CheckCircle2 className="size-4 text-emerald-400 mt-0.5"/> Withdraw to any Nigerian bank</li>
              </ul>
              <Link to="/verify/auth" search={{ tab: "signup" } as never}>
                <Button size="lg">Start earning</Button>
              </Link>
            </div>
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <TrendingUp className="size-5 text-primary"/> Example month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Numbers verified", "20"],
                  ["Numbers sold", "12"],
                  ["Avg. sale price", "₦25,000"],
                  ["Your share (75%)", "₦225,000"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-slate-800/60 pb-2 last:border-0">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-semibold text-slate-100">{v}</span>
                  </div>
                ))}
                <div className="pt-2 text-xs text-slate-500">
                  Illustrative example. Actual sales depend on marketplace demand.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* WHY VERIFY WITH XELLVIO */}
        <section className="border-y border-slate-800/60 bg-slate-900/30">
          <div className="max-w-5xl mx-auto px-6 py-20 space-y-10">
            <div className="text-center space-y-3">
              <div className="text-xs uppercase tracking-widest text-primary/80">Why Xellvio</div>
              <h2 className="text-3xl md:text-4xl font-bold">Built for independent verifiers</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Coins, title: "Best-in-class split", body: "75% of every sale is yours. No hidden platform fees." },
                { icon: Clock, title: "Fast payouts", body: "Request a withdrawal any time you hit ₦5,000. Most payouts land within 24–48 hours." },
                { icon: Globe2, title: "Global demand", body: "Businesses from around the world buy verified numbers from Xellvio — you tap into that demand." },
                { icon: ShieldCheck, title: "Zero risk", body: "You never pay to list a number. We only earn when you earn." },
                { icon: PhoneCall, title: "Bulk friendly", body: "Submit one number or a hundred. Track each one in your dashboard." },
                { icon: Users, title: "Real support", body: "A real human reviews your submissions and answers your questions." },
              ].map((f) => (
                <Card key={f.title} className="bg-slate-900 border-slate-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100 text-base">
                      <f.icon className="size-5 text-primary"/> {f.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-slate-400 text-sm">{f.body}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* WHAT YOU NEED */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-widest text-primary/80">Requirements</div>
              <h2 className="text-3xl md:text-4xl font-bold">What you need to start</h2>
              <p className="text-slate-400">
                Getting started as a Xellvio verifier takes less than 5 minutes.
                No paperwork, no upfront costs.
              </p>
            </div>
            <div className="space-y-3">
              {[
                "A valid email address",
                "A Nigerian bank account for payouts",
                "Access to toll-free numbers you can help get verified",
                "Willingness to follow our verification guidelines",
              ].map((r) => (
                <div key={r} className="flex items-start gap-3 rounded-lg bg-slate-900/60 border border-slate-800 p-4">
                  <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5"/>
                  <span className="text-slate-200 text-sm">{r}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-800/60 bg-slate-900/30">
          <div className="max-w-3xl mx-auto px-6 py-20 space-y-8">
            <div className="text-center space-y-3">
              <div className="text-xs uppercase tracking-widest text-primary/80 inline-flex items-center gap-2 justify-center">
                <HelpCircle className="size-4"/> FAQ
              </div>
              <h2 className="text-3xl md:text-4xl font-bold">Frequently asked questions</h2>
            </div>
            <div className="space-y-4">
              {[
                {
                  q: "How much do I earn per number?",
                  a: "You earn 75% of the sale price for every verified number that gets purchased. The exact price depends on the marketplace, but it typically ranges from ₦15,000 to ₦40,000 per number.",
                },
                {
                  q: "When do I get paid?",
                  a: "Your wallet is credited the moment a tenant buys one of your verified numbers. You can request a withdrawal to your Nigerian bank account any time you hit the ₦5,000 minimum.",
                },
                {
                  q: "Does it cost anything to become a verifier?",
                  a: "No. Signing up is completely free. We only earn our share when your numbers actually sell.",
                },
                {
                  q: "How many numbers can I submit?",
                  a: "There is no cap. You can submit as many toll-free numbers as you are able to source and get verified.",
                },
                {
                  q: "What happens if a number I submit fails verification?",
                  a: "You are only charged nothing — no penalty. We simply mark that number as rejected and you can submit another.",
                },
                {
                  q: "Do I need a business or company registration?",
                  a: "No. Individual verifiers are welcome. You just need a bank account we can pay you into.",
                },
              ].map((f) => (
                <Card key={f.q} className="bg-slate-900 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-slate-100">{f.q}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-slate-400 text-sm">{f.a}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto px-6 py-24 text-center space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold">Ready to start earning?</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Create your verifier account in under a minute. Submit your first
            number today and get paid the moment it sells.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link to="/verify/auth" search={{ tab: "signup" } as never}>
              <Button size="lg">Create verifier account</Button>
            </Link>
            <Link to="/verify/auth">
              <Button size="lg" variant="outline" className="border-white bg-white text-slate-950 hover:bg-slate-200 hover:text-slate-950">Sign in</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/60 px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-slate-500 flex-wrap gap-3">
          <div>© {new Date().getFullYear()} Xellvio</div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-slate-300">Main site</Link>
            <Link to="/verify/auth" className="hover:text-slate-300">Sign in</Link>
            <Link to="/verify/auth" search={{ tab: "signup" } as never} className="hover:text-slate-300">Become a verifier</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
