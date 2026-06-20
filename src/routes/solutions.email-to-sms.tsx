import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, ArrowRight, ShieldCheck, Globe2, Zap } from "lucide-react";

export const Route = createFileRoute("/solutions/email-to-sms")({
  head: () => ({
    meta: [
      { title: "Email to SMS Gateway — Send SMS from Email | Xellvio" },
      {
        name: "description",
        content:
          "Send SMS messages directly from any email client using Xellvio's Email to SMS gateway. Global delivery, simple setup, no code required.",
      },
      { property: "og:title", content: "Email to SMS Gateway — Send SMS from Email | Xellvio" },
      {
        property: "og:description",
        content: "Turn any email into a global SMS with Xellvio's Email to SMS gateway.",
      },
      { property: "og:url", content: "https://xellvio.com/solutions/email-to-sms" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://xellvio.com/solutions/email-to-sms" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Email to SMS Gateway — Send SMS from Email",
          description:
            "Guide to sending SMS directly from email using Xellvio's Email to SMS gateway.",
          author: { "@type": "Organization", name: "Xellvio" },
        }),
      },
    ],
  }),
  component: EmailToSmsPage,
});

const benefits = [
  { icon: Zap, title: "Zero code", text: "Send your first SMS by composing a regular email — no integration required." },
  { icon: Globe2, title: "Global reach", text: "Deliver to 200+ countries with local routes and country-aware pricing." },
  { icon: ShieldCheck, title: "Compliant by default", text: "Built-in opt-out handling, sender ID rules, and audit logs." },
];

function EmailToSmsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 md:py-28 text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">
              Email to SMS
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto">
              Send SMS straight from your email
            </h1>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Xellvio's Email to SMS gateway turns any outgoing email into a text message
              delivered worldwide — perfect for alerts, notifications, and ad-hoc campaigns
              from tools you already use.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/auth" search={{ mode: "signup", redirect: "/app" }}>
                <Button size="lg">
                  Get started free <ArrowRight className="size-4 ml-1" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline">
                  See pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 grid sm:grid-cols-3 gap-5">
            {benefits.map((b) => (
              <Card key={b.title} className="p-6">
                <div className="size-11 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <b.icon className="size-5" />
                </div>
                <h2 className="mt-4 font-semibold">{b.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{b.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-3xl font-extrabold tracking-tight">How Email to SMS works</h2>
            <p className="mt-3 text-muted-foreground">
              Email to SMS (sometimes called an SMS gateway) lets you send a text by
              addressing an email to a special recipient address. Xellvio receives the
              email, converts it into an SMS, and delivers it to the recipient's phone via
              local carriers — no developer setup, no third-party gateway.
            </p>

            <ol className="mt-8 space-y-6">
              <li className="flex gap-4">
                <div className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold">Connect your sending domain</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add your domain in Xellvio and verify it. Only emails from your
                    verified addresses can trigger an SMS.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold">Compose an email</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Send to{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      +14155551234@sms.xellvio.com
                    </code>
                    . The email body becomes the SMS body. Subject lines are ignored.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold">We deliver and track</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Xellvio routes the message via the best local carrier and reports
                    delivery back to your dashboard.
                  </p>
                </div>
              </li>
            </ol>

            <h2 className="mt-12 text-3xl font-extrabold tracking-tight">
              When to use Email to SMS
            </h2>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc pl-6">
              <li>System alerts from monitoring tools that only speak SMTP.</li>
              <li>Internal notifications from CRMs or helpdesks.</li>
              <li>One-off broadcasts when you don't want to log into another tool.</li>
              <li>Integrations with no-code platforms (Zapier, Make, n8n) via email.</li>
            </ul>

            <h2 className="mt-12 text-3xl font-extrabold tracking-tight">
              Email to SMS vs the API
            </h2>
            <p className="mt-3 text-muted-foreground">
              For high-volume campaigns, segmentation, or two-way conversations, use the{" "}
              <Link to="/docs" className="text-primary hover:underline">
                Xellvio API
              </Link>
              . Email to SMS is best for low-volume, transactional messages where speed of
              setup matters more than control.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-3xl text-center px-4">
            <div className="inline-flex items-center gap-2 text-primary">
              <Mail className="size-5" />
              <ArrowRight className="size-4" />
              <MessageSquare className="size-5" />
            </div>
            <h2 className="mt-3 text-3xl font-extrabold">Start sending in minutes</h2>
            <p className="mt-2 text-muted-foreground">
              50 free credits, no card required.
            </p>
            <Link to="/auth" search={{ mode: "signup", redirect: "/app" }} className="inline-block mt-6">
              <Button size="lg">
                Create free account <ArrowRight className="size-4 ml-1" />
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
