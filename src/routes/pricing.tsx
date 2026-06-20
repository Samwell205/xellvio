import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { CreditPacks } from "@/components/CreditPacks";
import { SmsCalculator } from "@/components/SmsCalculator";
import { PerCountryPricing } from "@/components/PerCountryPricing";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicCountryRates } from "@/lib/public-pricing.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SAMWELL SMS HUB" },
      { name: "description", content: "Pay-as-you-go SMS credits. Estimate cost per country and per message instantly." },
      { property: "og:title", content: "Pricing — SAMWELL SMS HUB" },
      { property: "og:description", content: "Buy credits, estimate per-country costs, and see live SMS pricing." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const loadRates = useServerFn(getPublicCountryRates);
  const ratesQ = useQuery({ queryKey: ["public-country-rates"], queryFn: () => loadRates() });
  const rates = ratesQ.data;

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-24 text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">Pricing</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight">
              Pay only for what you send
            </h1>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              SMS are billed per recipient at the country rate × segments. We never debit more than your
              available balance — any messages your balance can't cover are skipped, not charged.
            </p>
          </div>
        </section>
        <CreditPacks />
        <SmsCalculator rates={rates} />
        <PerCountryPricing rates={rates} />
      </main>
      <MarketingFooter />
    </div>
  );
}
