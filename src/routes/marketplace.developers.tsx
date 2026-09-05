import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Code2, GitBranch, Rocket, ShieldCheck, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/marketplace/developers")({
  head: () => ({
    meta: [
      { title: "Build for Xellvio — Developer Marketplace" },
      {
        name: "description",
        content:
          "Publish an integration on the Xellvio App Marketplace: declare actions and triggers, test in a sandbox, submit for review and reach every workspace.",
      },
      { property: "og:title", content: "Build for Xellvio — Developer Marketplace" },
      {
        property: "og:description",
        content: "Ship an integration to every Xellvio workspace with actions, triggers, webhooks and API keys.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DevelopersPage,
});

const STEPS = [
  { icon: Code2, title: "Create your developer profile", body: "Tell us who you are, your support contact and where your docs live." },
  { icon: GitBranch, title: "Declare actions and triggers", body: "Map your API onto Xellvio's canonical contacts, orders, payments and events." },
  { icon: Webhook, title: "Test in the sandbox", body: "Verify your endpoints and webhooks respond before anyone installs." },
  { icon: Rocket, title: "Submit and publish", body: "Our team reviews your app, then it appears for every Xellvio workspace." },
];

function DevelopersPage() {
  return (
    <main>
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_20%_0%,hsl(var(--primary)/0.2),transparent_70%)]" />
        <div className="mx-auto w-full max-w-5xl px-4 py-20 md:px-6">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Code2 className="size-3.5 text-primary" /> Developer platform
          </span>
          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Build an integration once. Reach every Xellvio workspace.
          </h1>
          <p className="mt-5 max-w-2xl text-muted-foreground md:text-lg">
            Xellvio maps every app onto one canonical data model — contacts, orders, payments, bookings and events. Wire
            your API in once and it works inside campaigns, automations, flows and landing pages.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/app/developer">Open developer portal</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/marketplace/apps">See existing apps</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How publishing works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="size-5" />
                </div>
                <span className="text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <p className="mt-4 font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 md:grid-cols-2 md:px-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What you get</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {[
                "Scoped API keys with one-time secrets and instant revocation",
                "Webhook delivery with retries and full request logging",
                "Install, usage and error analytics per workspace",
                "Versioning and changelogs your customers can see",
                "Review workflow so published apps stay trustworthy",
              ].map((x) => (
                <li key={x} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <p className="flex items-center gap-2 font-medium">
              <BookOpen className="size-4 text-primary" /> Canonical entities
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Map your objects to any of these and Xellvio handles the rest.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "contact",
                "company",
                "lead",
                "deal",
                "product",
                "customer",
                "order",
                "payment",
                "invoice",
                "appointment",
                "subscription",
                "form_submission",
                "message",
              ].map((e) => (
                <code key={e} className="rounded-md border bg-muted px-2 py-1 text-xs">
                  {e}
                </code>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-16 text-center md:px-6">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Ready to ship?</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Create your developer profile, define your first action and submit for review — usually within a day.
        </p>
        <Button asChild size="lg" className="mt-6 rounded-full">
          <Link to="/app/developer">Start building</Link>
        </Button>
      </section>
    </main>
  );
}
