import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublishedPartner } from "@/lib/authority/partners";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/partners/$slug")({
  head: ({ params }) =>
    pageHead({
      path: `/partners/${params.slug}`,
      title: `${params.slug.replace(/-/g, " ")} — Xellvio partner`,
      description: `How this Xellvio partner works with Xellvio for SMS campaigns, automations, sign-up forms and landing pages.`,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Partners", path: "/partners" },
        { name: params.slug, path: `/partners/${params.slug}` },
      ],
    }),
  component: PartnerPage,
});

function PartnerPage() {
  const { slug } = Route.useParams();
  const partner = useQuery({
    queryKey: ["public-partner", slug],
    queryFn: () => getPublishedPartner(slug),
  });
  const p = partner.data;

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main className="max-w-3xl mx-auto px-4 py-16">
        <Link to="/partners" className="text-sm text-muted-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> All partners
        </Link>

        {partner.isLoading ? (
          <Skeleton className="h-64 w-full mt-6" />
        ) : !p ? (
          <div className="mt-8">
            <h1 className="text-2xl font-semibold">Partner not found</h1>
            <p className="text-muted-foreground mt-2">
              This partner profile is not published.{" "}
              <Link to="/partners" className="text-primary underline">
                Browse all partners
              </Link>
              .
            </p>
          </div>
        ) : (
          <article className="mt-6 space-y-8">
            <header className="space-y-4">
              <div className="flex items-center gap-4">
                {p.logo_url ? (
                  <img src={p.logo_url} alt={`${p.name} logo`} loading="lazy" decoding="async" className="size-12 rounded-lg object-contain" />
                ) : null}
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
                  {p.relationship ? (
                    <Badge variant="outline" className="mt-1 capitalize">
                      {p.relationship.replace(/_/g, " ")} partner
                    </Badge>
                  ) : null}
                </div>
              </div>
              {p.short_description ? <p className="text-lg text-muted-foreground">{p.short_description}</p> : null}
              <div className="flex flex-wrap gap-3">
                {p.website_url ? (
                  <Button asChild variant="outline">
                    <a href={p.website_url} target="_blank" rel="noreferrer">
                      Visit {p.name} <ExternalLink className="size-3.5 ml-1" />
                    </a>
                  </Button>
                ) : null}
                {p.integration_app_slug ? (
                  <Button asChild>
                    <Link to="/marketplace/apps/$slug" params={{ slug: p.integration_app_slug }}>
                      View the integration
                    </Link>
                  </Button>
                ) : null}
              </div>
            </header>

            {p.description ? (
              <section className="space-y-2">
                <h2 className="text-xl font-medium">About {p.name}</h2>
                <p className="text-muted-foreground whitespace-pre-line">{p.description}</p>
              </section>
            ) : null}

            {p.integration_summary ? (
              <section className="space-y-2">
                <h2 className="text-xl font-medium">How it works with Xellvio</h2>
                <p className="text-muted-foreground whitespace-pre-line">{p.integration_summary}</p>
              </section>
            ) : null}

            {p.use_cases.length ? (
              <section className="space-y-2">
                <h2 className="text-xl font-medium">What businesses use it for</h2>
                <ul className="space-y-1.5">
                  {p.use_cases.map((u) => (
                    <li key={u} className="flex gap-2 text-muted-foreground">
                      <Check className="size-4 text-primary mt-0.5 shrink-0" /> {u}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {p.benefits.length ? (
              <section className="space-y-2">
                <h2 className="text-xl font-medium">Benefits</h2>
                <ul className="space-y-1.5">
                  {p.benefits.map((b) => (
                    <li key={b} className="flex gap-2 text-muted-foreground">
                      <Check className="size-4 text-primary mt-0.5 shrink-0" /> {b}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-lg font-medium">Start sending with Xellvio</h2>
                <p className="text-sm text-muted-foreground">
                  Run SMS campaigns, automations, sign-up forms and landing pages from one place.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/auth">Create an account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/pricing">See pricing</Link>
                  </Button>
                </div>
                {p.related_links.length ? (
                  <div className="flex flex-wrap gap-3 text-sm pt-2">
                    {p.related_links.map((l) => (
                      <a key={l} href={l} className="text-primary underline">
                        {l}
                      </a>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </article>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
