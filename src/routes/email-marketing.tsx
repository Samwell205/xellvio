import { createFileRoute } from "@tanstack/react-router";
import { Mail, Workflow, Palette, BarChart3, Check } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import {
  ChannelSubNav,
  ChannelHero,
  StatsMarquee,
  PillarGrid,
  SplitFeature,
  ProofCards,
  ChannelFaq,
  ChannelCta,
} from "@/components/marketing/ProductKit";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/email-marketing")({
  head: () =>
    pageHead({
      path: "/email-marketing",
      title: "Email Marketing Alongside Your SMS",
      description:
        "Run email campaigns from the same Xellvio audience as your texts — shared lists, shared consent, shared automations and one report for both channels.",
    }),
  component: EmailMarketingPage,
});

function EmailMarketingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <ChannelSubNav
        channel="Email"
        items={[
          { label: "Overview", hash: "#overview" },
          { label: "Design", hash: "#design" },
          { label: "Automations", hash: "#automations" },
          { label: "Reporting", hash: "#reporting" },
          { label: "FAQ", hash: "#faq" },
        ]}
      />
      <main className="flex-1">
        <ChannelHero
          eyebrow="Xellvio Email"
          badge="Early access"
          title={<>Email marketing that pairs with your texts</>}
          body="One audience, two channels. Design an email, follow it with a text and see the revenue from both in the same report — no exporting, no duplicate lists."
          primary={{ label: "Join early access", to: "/contact" }}
          secondary={{ label: "See SMS today", to: "/sms-marketing" }}
          visual={<InboxVisual />}
        />
        <StatsMarquee
          tone="coral"
          stats={[
            { value: "1", label: "shared contact record" },
            { value: "A/B", label: "testing on every send" },
            { value: "Drag", label: "and drop email builder" },
            { value: "SMS+", label: "email in one journey" },
          ]}
        />
        <PillarGrid
          id="overview"
          heading="Build smarter email campaigns"
          items={[
            {
              icon: Palette,
              title: "Design without a designer",
              text: "Drag-and-drop blocks, saved brand colours and fonts, and templates that already look like you.",
            },
            {
              icon: Workflow,
              title: "Automate the whole journey",
              text: "Welcome, browse-abandon and win-back sequences that can switch to SMS when email goes unopened.",
            },
            {
              icon: Mail,
              title: "Land in the inbox",
              text: "Authenticated sending on your own domain, with bounce and complaint handling built in.",
            },
            {
              icon: BarChart3,
              title: "Report on both channels",
              text: "Opens, clicks and revenue sit beside your SMS numbers instead of in a separate tool.",
            },
          ]}
        />
        <SplitFeature
          id="design"
          heading="A builder your team will actually use"
          body="Start from a template, drop in products, images and buttons, and preview desktop and phone side by side before anything sends."
          points={[
            "Reusable brand tokens keep every email on-brand automatically.",
            "Mobile preview and plain-text version generated for you.",
            "Save any layout as a template the whole team can reuse.",
          ]}
          visual={<BuilderVisual />}
        />
        <SplitFeature
          id="automations"
          flip
          heading="Email and SMS in the same journey"
          body="Stop running two disconnected calendars. One automation can email first, wait, then text only the people who didn't open."
          points={[
            "Branch on opens, clicks, purchases or any custom event.",
            "Channel-aware quiet hours and frequency caps.",
            "Consent for email and SMS stored separately and respected everywhere.",
          ]}
          visual={<JourneyVisual />}
        />
        <SplitFeature
          id="reporting"
          heading="One report, every channel"
          body="See the full picture per campaign: who opened, who clicked, who bought, and what the send cost you."
          points={[
            "Revenue attribution across email and SMS touches.",
            "Deliverability health with bounce and complaint trends.",
            "Exportable results for finance and stakeholders.",
          ]}
          visual={<EmailReportVisual />}
        />
        <ProofCards
          items={[
            {
              stat: "63x",
              label: "typical email ROI",
              quote:
                "Email stays the cheapest way to talk to a warm list — SMS is what makes it urgent.",
            },
            {
              stat: "40%",
              label: "open rate on winning variant",
              quote: "A/B testing subject lines on every send compounds quickly across a year.",
            },
            {
              stat: "2x",
              label: "reach when channels combine",
              quote:
                "Emailing first and texting the non-openers reaches people a single channel misses.",
            },
          ]}
        />
        <ChannelFaq
          id="faq"
          items={[
            {
              q: "Is email available now?",
              a: "Email is in early access. Join the list and we'll switch it on for your account as we roll it out — SMS is fully live today.",
            },
            {
              q: "Will my SMS contacts carry over?",
              a: "Yes. Contacts, lists and segments are shared, so an email audience is the same audience you already text.",
            },
            {
              q: "Can I send from my own domain?",
              a: "Yes. You'll add a few DNS records once and we verify authentication before your first send.",
            },
            {
              q: "How is email priced?",
              a: "Email is billed separately from SMS credits. Pricing is published before early access opens to your account.",
            },
          ]}
        />
        <ChannelCta
          title="Get on the email early access list"
          body="Tell us about your list size and sending plans, and we'll set your account up as slots open."
          cta={{ label: "Request early access", to: "/contact" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

/* --------------------------------- visuals -------------------------------- */

function InboxVisual() {
  return (
    <div className="rounded-[28px] bg-sand p-8 md:p-12">
      <div className="mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 font-bold text-foreground">
          <Mail className="size-4 text-coral" /> Email A/B test
        </div>
        {[
          { v: "A", s: "We saved your size — 15% off", r: "40.2%" },
          { v: "B", s: "Back in stock, and it won't last", r: "32.7%" },
        ].map((t) => (
          <div key={t.v} className="mb-3 rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-foreground">
                {t.v}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground">{t.s}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Open rate
                </p>
                <p className="text-2xl font-extrabold tracking-tight text-foreground">{t.r}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuilderVisual() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div className="rounded-xl border border-border bg-card p-4 text-center text-sm font-bold text-foreground">
        Your logo
      </div>
      <div className="h-28 rounded-xl bg-muted" />
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="h-3 w-2/3 rounded bg-muted" />
        <div className="mt-2 h-3 w-full rounded bg-muted" />
        <div className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
          Shop the drop
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 rounded-xl bg-muted" />
        <div className="h-20 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function JourneyVisual() {
  const steps = [
    { l: "Send email · welcome", c: true },
    { l: "Wait 2 days", c: true },
    { l: "Opened the email?", c: false },
    { l: "No → send SMS reminder", c: true },
  ];
  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      {steps.map((s) => (
        <div
          key={s.l}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-foreground"
        >
          {s.c ? (
            <Check className="size-4 shrink-0 text-coral" />
          ) : (
            <Workflow className="size-4 shrink-0 text-coral" />
          )}
          {s.l}
        </div>
      ))}
    </div>
  );
}

function EmailReportVisual() {
  const rows = [
    { l: "Emails delivered", v: "48,930" },
    { l: "Opens", v: "19,672" },
    { l: "Clicks", v: "3,104" },
    { l: "Revenue", v: "$41,280" },
  ];
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-5">
      <div className="mb-4 font-bold text-foreground">Campaign performance</div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{r.l}</span>
            <span className="text-sm font-semibold text-foreground">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
