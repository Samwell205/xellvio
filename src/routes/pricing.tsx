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
        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                US &amp; Canada sending
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
                Send today with a ready-made verified number
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Skip the carrier wait. Choose an already-verified toll-free number in your
                dashboard and launch your first campaign the same day.
              </p>
            </div>
            <div className="text-sm text-muted-foreground space-y-3">
              <p>
                <strong className="text-foreground">Instant:</strong> ready-made verified
                toll-free number, active as soon as you pick it.
              </p>
              <p>
                <strong className="text-foreground">Your own number:</strong> free toll-free
                verification wizard — carrier approval usually takes 1–3 weeks.
              </p>
            </div>
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
