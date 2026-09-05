import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Handshake } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listPublishedPartners } from "@/lib/authority/partners";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/partners/")({
  head: () =>
    pageHead({
      path: "/partners",
      title: "Xellvio Partners & Integration Partners",
      description:
        "Agencies, technology partners and integration partners that work with Xellvio to help businesses run SMS campaigns, automations, sign-up forms and landing pages.",
      ogTitle: "Partners working with Xellvio",
      ogDescription:
        "Meet the verified agencies, technology and integration partners building on Xellvio's messaging platform.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Partners", path: "/partners" },
      ],
    }),
  component: PartnersIndex,
});

function PartnersIndex() {
  const partners = useQuery({ queryKey: ["public-partners"], queryFn: listPublishedPartners });
  const rows = partners.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main className="max-w-5xl mx-auto px-4 py-16">
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-4">
            <Handshake className="size-3.5 mr-1" /> Partners
          </Badge>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Partners working with Xellvio
          </h1>
          <p className="mt-4 text-muted-foreground">
            Xellvio works with agencies, technology companies and platforms that help businesses reach
            customers over SMS. Every partner listed here has a relationship or integration we have
            confirmed ourselves.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {partners.isLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : rows.length === 0 ? (
            <Card className="sm:col-span-2">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Partner profiles are published here as partnerships are confirmed. If you build tools for
                marketing, ecommerce or customer messaging and want to work with Xellvio,{" "}
                <Link to="/contact" className="text-primary underline">
                  get in touch
                </Link>
                .
              </CardContent>
            </Card>
          ) : (
            rows.map((p) => (
              <Link key={p.id} to="/partners/$slug" params={{ slug: p.slug }} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center gap-3">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt={`${p.name} logo`} className="size-9 rounded-md object-contain" loading="lazy" />
                      ) : null}
                      <div>
                        <h2 className="font-medium">{p.name}</h2>
                        {p.relationship ? (
                          <span className="text-xs text-muted-foreground capitalize">
                            {p.relationship.replace(/_/g, " ")} partner
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{p.short_description}</p>
                    <span className="text-sm text-primary inline-flex items-center gap-1">
                      View partner <ArrowRight className="size-3.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        <div className="mt-12 rounded-xl border border-border p-6">
          <h2 className="font-medium">Explore the platform</h2>
          <p className="text-sm text-muted-foreground mt-1">
            See what partners build on.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link to="/marketplace/apps" className="text-primary underline">Apps & integrations</Link>
            <Link to="/sms-marketing" className="text-primary underline">SMS marketing</Link>
            <Link to="/automations" className="text-primary underline">Automations</Link>
            <Link to="/landing-pages" className="text-primary underline">Landing pages</Link>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
