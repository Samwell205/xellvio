import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SAMWELL SMS HUB" },
      { name: "description", content: "Simple, transparent pricing. Start free with 50 credits and scale as you grow." },
      { property: "og:title", content: "Pricing — SAMWELL SMS HUB" },
      { property: "og:description", content: "Plans that scale with you." },
    ],
  }),
  component: PricingPage,
});

const plans = (yearly: boolean) => [
  { name: "Starter", monthly: 0, yearly: 0, desc: "For trying things out.", features: ["500 SMS / mo", "1 sender ID", "Email support", "Basic analytics"], cta: "Start free" },
  { name: "Business", monthly: 49, yearly: 39, desc: "For growing teams.", features: ["25,000 SMS / mo", "5 sender IDs", "Full API access", "Priority support", "Advanced analytics", "Automation"], cta: "Start trial", featured: true },
  { name: "Enterprise", monthly: 0, yearly: 0, desc: "For high-volume senders.", features: ["Unlimited volume", "Dedicated routes", "Custom integrations", "24/7 SLA", "Account manager"], cta: "Contact sales", custom: true },
];

function PricingPage() {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-24 text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">Pricing</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight">Plans that scale with you</h1>
            <p className="mt-3 text-muted-foreground">Start free. Upgrade anytime. Cancel whenever.</p>
            <div className="mt-8 inline-flex rounded-full border bg-background p-1">
              <button onClick={() => setYearly(false)} className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${!yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Monthly</button>
              <button onClick={() => setYearly(true)} className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                Yearly <span className="text-xs ml-1 opacity-80">-20%</span>
              </button>
            </div>
          </div>
        </section>
        <section className="pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 grid md:grid-cols-3 gap-5">
            {plans(yearly).map((p) => (
              <Card key={p.name} className={`p-7 ${p.featured ? "border-primary ring-2 ring-primary/30 relative" : ""}`}>
                {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>}
                <div className="font-semibold">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  {p.custom ? <span className="text-4xl font-extrabold">Custom</span> : <>
                    <span className="text-4xl font-extrabold">${yearly ? p.yearly : p.monthly}</span>
                    <span className="text-muted-foreground">/mo</span>
                  </>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 text-success shrink-0 mt-0.5" /> {f}</li>)}
                </ul>
                <Link to="/auth" className="block mt-6">
                  <Button className="w-full" variant={p.featured ? "default" : "outline"}>{p.cta}</Button>
                </Link>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
