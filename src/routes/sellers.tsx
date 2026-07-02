import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, DollarSign, ShieldCheck, Wallet } from "lucide-react";

export const Route = createFileRoute("/sellers")({
  head: () => ({
    meta: [
      { title: "Earn from verified toll-free numbers — Xellvio Sellers" },
      { name: "description", content: "Verify toll-free numbers and get paid when businesses buy them. Instant marketplace payouts to your Nigerian bank account." },
      { property: "og:title", content: "Xellvio Sellers — Get paid for verified toll-free numbers" },
      { property: "og:description", content: "Turn approved toll-free numbers into recurring income." },
    ],
  }),
  component: SellersLanding,
});

function SellersLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-20 md:py-28 text-center">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">Xellvio Sellers</p>
          <h1 className="mt-4 text-5xl md:text-6xl font-extrabold tracking-tight">
            Get paid for every<br/>verified toll-free number
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Verify US toll-free numbers with the carriers. When a Xellvio customer needs one instantly, we sell yours and pay you. Withdraw to your Nigerian bank account any time.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth" search={{ mode: "signup", seller: 1 } as never}>
              <Button size="lg" className="rounded-full">Become a seller <ArrowRight className="size-4 ml-1"/></Button>
            </Link>
            <Link to="/sellers/dashboard"><Button size="lg" variant="outline" className="rounded-full">Seller dashboard</Button></Link>
          </div>
        </section>
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-20 grid md:grid-cols-3 gap-6">
          {[
            { icon: ShieldCheck, t: "1. Verify a number", d: "Submit a US toll-free number through our carrier verification flow. Approval typically takes 1–3 business days." },
            { icon: DollarSign, t: "2. Earn on every sale", d: "When a business buys an already-verified number, you get paid instantly to your seller balance." },
            { icon: Wallet, t: "3. Withdraw to your bank", d: "Add your Nigerian bank account (verified via Paystack) and request a withdrawal any time." },
          ].map((s) => (
            <div key={s.t} className="border rounded-2xl p-6 bg-card">
              <s.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold text-lg">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </section>
        <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-24">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><Check className="size-4 text-primary mt-0.5"/> No monthly fees — pay only the one-time carrier verification cost per number.</li>
            <li className="flex gap-2"><Check className="size-4 text-primary mt-0.5"/> Payouts held in your Xellvio seller balance until you request a withdrawal.</li>
            <li className="flex gap-2"><Check className="size-4 text-primary mt-0.5"/> Nigerian bank accounts verified via Paystack — no wrong-account payouts.</li>
          </ul>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
