import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { CreditPacks } from "@/components/CreditPacks";
import { SmsCalculator } from "@/components/SmsCalculator";
import { PerCountryPricing } from "@/components/PerCountryPricing";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicCountryRates } from "@/lib/public-pricing.functions";
import { EmailPlans } from "@/components/EmailPlans";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/pricing")({
  head: () =>
    pageHead({
      path: "/pricing",
      title: "Pricing — Email Plans & Pay-As-You-Go SMS",
      description:
        "Free, Standard and Pro email plans that scale with your contacts, plus pay-as-you-go SMS with live per-country rates.",
    }),
  component: PricingPage,
});

function PricingPage() {
  const loadRates = useServerFn(getPublicCountryRates);
  const ratesQ = useQuery({
    queryKey: ["public-country-rates"],
    queryFn: () => loadRates(),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  const rates = ratesQ.data;

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-24 text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">Pricing</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight">
              Simple pricing for email and SMS
            </h1>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Start free with email, upgrade as your list grows, and pay only for the text messages
              you send.
            </p>
          </div>
        </section>
        <EmailPlans />
        <CreditPacks />
        <SmsCalculator rates={rates} />
        <PerCountryPricing rates={rates} />
      </main>
      <MarketingFooter />
    </div>
  );
}
