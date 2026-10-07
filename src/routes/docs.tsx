import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  KeyRound,
  MessageSquare,
  Phone,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/docs")({
  head: () =>
    pageHead({
      path: "/docs",
      title: "Documentation — SMS API and Setup Guides",
      description:
        "Xellvio documentation: create an account, verify a sender identity, import contacts, send campaigns, manage wallet credits and call the SMS API.",
    }),
  component: DocsPage,
});

const quickStart = [
  {
    title: "Create account",
    text: "Sign up with email or Google. Use a unique password that has not been leaked in a data breach.",
  },
  {
    title: "Add sender identity",
    text: "Request a toll-free number, verify a personal number by OTP, or submit a sender ID for admin approval.",
  },
  {
    title: "Import contacts",
    text: "Create groups, upload contacts, and keep consent records current before messaging.",
  },
  {
    title: "Send and measure",
    text: "Draft a single SMS or campaign, choose a verified sender, then monitor message delivery.",
  },
];

const guides = [
  {
    icon: Phone,
    title: "Numbers and sender IDs",
    text: "Toll-free numbers are provisioned from inventory. Personal numbers are caller ID only after OTP verification. Sender IDs require admin review.",
  },
  {
    icon: MessageSquare,
    title: "Sending rules",
    text: "SMS sends are blocked unless the selected sender identity is verified or approved. Messages are stored with status for tracking.",
  },
  {
    icon: Wallet,
    title: "Billing and wallet",
    text: "Wallet credits are stored per account in USD. Each successful send writes a transaction and updates the wallet balance.",
  },
  {
    icon: KeyRound,
    title: "API access",
    text: "API keys belong to the signed-in user and should only be used from trusted systems. Rotate keys when access changes.",
  },
];

const apiExample = [
  "curl -X POST https://xellvio.com/api/public/v1/messages \\",
  '  -H "Authorization: Bearer xv_api_..." \\',
  '  -H "Idempotency-Key: order-10482" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{",
  '    "to": "+14155550123",',
  '    "body": "Your order is ready for pickup. Reply STOP to opt out.",',
  '    "consent_confirmed": true',
  "  }'",
].join("\n");

const apiEndpoints = [
  ["POST", "/messages", "Queue one SMS"],
  ["POST", "/messages/bulk", "Queue up to 1,000 recipients"],
  ["GET", "/messages/{id}", "Read message status and failure details"],
  ["GET", "/batches/{id}", "Read batch totals and recipient results"],
  ["GET", "/replies", "Read inbound replies with cursor pagination"],
  ["GET", "/senders", "List verified workspace senders"],
  ["GET", "/suppressions/{phone}", "Check whether a number opted out"],
];

const webhookExample = [
  "X-Xellvio-Event: message.delivered",
  "X-Xellvio-Timestamp: 1791372000",
  "X-Xellvio-Signature: v1=<hex HMAC-SHA256>",
  "",
  "signed_payload = timestamp + '.' + raw_request_body",
].join("\n");

function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient border-b">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-28">
            <Badge variant="outline" className="bg-background/70">
              <BookOpen className="mr-1 size-3" /> Documentation
            </Badge>
            <h1 className="mt-5 max-w-4xl text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Start sending compliant SMS from verified sender identities
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
              The core setup follows the same reliable pattern used by mature SMS platforms:
              authenticate, verify sender, confirm consent, send, and track delivery.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button size="lg">
                  Create account <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link to="/app/setup-sms">
                <Button size="lg" variant="outline">
                  Manage senders
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Alert className="mb-8 border-primary/30 bg-primary/5">
              <ShieldCheck className="size-4" />
              <AlertTitle>Signup security</AlertTitle>
              <AlertDescription>
                Weak or previously leaked passwords are rejected. If signup appears blocked, choose
                a stronger unique password or use Google sign-in.
              </AlertDescription>
            </Alert>
            <div className="grid gap-5 md:grid-cols-4">
              {quickStart.map((step, index) => (
                <Card key={step.title} className="p-6">
                  <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <h2 className="mt-4 font-semibold">{step.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 border-y bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold text-primary uppercase tracking-wider">Guides</p>
              <h2 className="mt-3 text-3xl font-extrabold">Operational rules</h2>
              <p className="mt-3 text-muted-foreground">
                These are the backend-backed rules the product enforces before allowing sends or
                account changes.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {guides.map((guide) => (
                <Card key={guide.title} className="p-6">
                  <guide.icon className="size-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{guide.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{guide.text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="api-reference" className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <Code2 className="size-6 text-primary" />
              <h2 className="mt-4 text-xl font-semibold">API sending checklist</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {[
                  "Use an active API key",
                  "Send from a verified number or approved sender ID",
                  "Store contacts with consent",
                  "Check wallet balance before high-volume sends",
                  "Read message status after send",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {item}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-6 bg-secondary text-secondary-foreground">
              <h2 className="text-xl font-semibold">Example request</h2>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-background/10 p-4 text-xs leading-relaxed">
                <code>{apiExample}</code>
              </pre>
            </Card>
          </div>
          <div className="mx-auto mt-10 grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-xl font-semibold">REST API reference</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Base URL: <code>https://xellvio.com/api/public/v1</code>. Create workspace keys under Settings → API &amp; webhooks. Keys are shown once, can be scoped, and can be revoked immediately.
              </p>
              <div className="mt-5 divide-y rounded-md border">
                {apiEndpoints.map(([method, path, detail]) => (
                  <div key={path} className="grid grid-cols-[54px_1fr] gap-3 p-3 text-sm">
                    <Badge variant="outline" className="w-fit">{method}</Badge>
                    <div><code>{path}</code><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Authentication:</strong> send the workspace key as a Bearer token from a secure server.</p>
                <p><strong className="text-foreground">Idempotency:</strong> every POST send requires a unique <code>Idempotency-Key</code>. Replaying the same body returns the original result without creating another charge or message.</p>
                <p><strong className="text-foreground">Consent:</strong> every recipient requires <code>consent_confirmed: true</code>. Suppressed numbers are always rejected.</p>
                <p><strong className="text-foreground">Limits:</strong> 120 API requests per minute per key by default; bulk requests accept 1–1,000 recipients. Carrier throughput depends on the verified sender and destination route.</p>
              </div>
            </Card>
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Signed webhooks</h2>
              <p className="mt-2 text-sm text-muted-foreground">Register a public HTTPS endpoint to receive delivery, failure, reply, STOP, START, and batch events. Failed deliveries retry with exponential backoff for up to eight attempts.</p>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-secondary p-4 text-xs leading-relaxed text-secondary-foreground"><code>{webhookExample}</code></pre>
              <p className="mt-4 text-sm text-muted-foreground">Verify the signature against the exact raw request body, reject stale timestamps, and deduplicate using the event <code>id</code>. Signing secrets are shown once and can be rotated from Settings.</p>
              <div className="mt-5 flex flex-wrap gap-2">{["message.sent","message.delivered","message.delivery_unconfirmed","message.failed","reply.received","contact.opted_out","contact.opted_in","batch.completed"].map((event) => <Badge key={event} variant="outline">{event}</Badge>)}</div>
            </Card>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
