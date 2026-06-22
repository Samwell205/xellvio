import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2, ShieldCheck, Zap, Users, Sparkles } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Xellvio — Global SMS for modern businesses" },
      {
        name: "description",
        content:
          "Xellvio helps businesses reach customers worldwide with fast, reliable, compliant bulk SMS — built for marketers, support teams, and developers.",
      },
      { property: "og:title", content: "About Xellvio" },
      {
        property: "og:description",
        content:
          "Learn about Xellvio's mission to make global, compliant SMS effortless for businesses of every size.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <section className="px-4 sm:px-6 py-20 max-w-5xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Reach the world. One message at a time.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Xellvio is a global SMS platform built for businesses that need
            reliable delivery, transparent pricing, and carrier-grade
            compliance — without the enterprise overhead.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/contact">Talk to us</Link>
            </Button>
          </div>
        </section>

        <section className="px-4 sm:px-6 py-12 max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-5">
            <Card className="p-6">
              <Sparkles className="size-6 text-primary mb-3" />
              <h2 className="font-semibold text-lg">Our mission</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Make business messaging accessible everywhere — so a startup
                in Lagos and a retailer in Toronto can both reach their
                customers with the same trusted infrastructure used by
                global brands.
              </p>
            </Card>
            <Card className="p-6">
              <Users className="size-6 text-primary mb-3" />
              <h2 className="font-semibold text-lg">Who we serve</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Marketing teams running campaigns, support teams answering
                customers, and developers building messaging into their own
                products. One platform, every use case.
              </p>
            </Card>
          </div>
        </section>

        <section className="px-4 sm:px-6 py-12 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center">What sets us apart</h2>
          <div className="mt-8 grid sm:grid-cols-3 gap-5">
            <Feature
              icon={<Globe2 className="size-6 text-primary" />}
              title="Global reach"
              body="Send to 190+ countries with local routes that maximize delivery and minimize spend."
            />
            <Feature
              icon={<ShieldCheck className="size-6 text-primary" />}
              title="Compliance built in"
              body="Toll-free verification, opt-in consent, suppression lists, and carrier rules handled for you."
            />
            <Feature
              icon={<Zap className="size-6 text-primary" />}
              title="Fast & reliable"
              body="Carrier-grade throughput, real-time delivery insights, and intelligent retries."
            />
          </div>
        </section>

        <section className="px-4 sm:px-6 py-16 max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold">Ready to start sending?</h2>
          <p className="mt-3 text-muted-foreground">
            Create an account in minutes — no contracts, no minimums.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Create free account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-6">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </Card>
  );
}
