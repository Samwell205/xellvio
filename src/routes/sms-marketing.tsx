import { createFileRoute } from "@tanstack/react-router";
import {
  MessageSquare, Globe2, Sparkles, BarChart3, Send, Flag, Check, MousePointerClick,
} from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import {
  ChannelSubNav, ChannelHero, StatsMarquee, PillarGrid, SplitFeature, ProofCards,
  ChannelFaq, ChannelCta,
} from "@/components/marketing/ProductKit";

export const Route = createFileRoute("/sms-marketing")({
  head: () => ({
    meta: [
      { title: "SMS Marketing Built for Smarter Sends — Xellvio" },
      {
        name: "description",
        content:
          "Run SMS marketing that converts: two-way texting in 190+ countries, automations, segments, link tracking and compliance handled for you.",
      },
      { property: "og:title", content: "SMS Marketing Built for Smarter Sends — Xellvio" },
      {
        property: "og:description",
        content: "Two-way texting in 190+ countries with automations, segments, link tracking and built-in compliance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SmsMarketingPage,
});

function SmsMarketingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />
      <ChannelSubNav
        channel="SMS"
        items={[
          { label: "Overview", hash: "#overview" },
          { label: "Features", hash: "#features" },
          { label: "Global delivery", hash: "#global" },
          { label: "Reporting", hash: "#reporting" },
          { label: "FAQ", hash: "#faq" },
        ]}
      />
      <main className="flex-1">
        <ChannelHero
          eyebrow="Xellvio SMS"
          title={<>SMS marketing built for smarter sends</>}
          body="Reach, convert and retain customers with personal, timely conversations — powered by automation and one shared view of every contact."
          primary={{ label: "Sign up", to: "/auth" }}
          secondary={{ label: "Take a tour", to: "/features" }}
          visual={<PhoneVisual />}
        />
        <StatsMarquee
          tone="lime"
          stats={[
            { value: "190+", label: "countries reached" },
            { value: "5,000", label: "messages per minute" },
            { value: "98%", label: "average delivery rate" },
            { value: "2-way", label: "conversations built in" },
          ]}
        />
        <PillarGrid
          id="overview"
          heading="Text your way to better results"
          items={[
            { icon: MessageSquare, title: "Personal at any scale", text: "Merge names, orders and custom fields into every message, then reply from a shared inbox." },
            { icon: Globe2, title: "Meet people where they are", text: "Tier-1 carrier routes in 190+ countries, with each country's sender rules handled for you." },
            { icon: Sparkles, title: "Automate the follow-up", text: "Keyword replies, welcome series and win-backs that run without you lifting a finger." },
            { icon: BarChart3, title: "See what actually worked", text: "Delivery, clicks and spend per campaign, per country, per message." },
          ]}
        />
        <SplitFeature
          id="features"
          heading="The data to send texts people want"
          body="Stronger relationships start with better data, so every text lands as something useful rather than something to opt out of."
          points={[
            "Segment on behaviour, location, spend or any custom field — lists update themselves.",
            "Two-way keyword conversations answer FAQs and route people to the right offer.",
            "Marketing and transactional consent are stored separately, so opt-outs are always respected.",
          ]}
          visual={<FlowVisual />}
        />
        <SplitFeature
          id="global"
          flip
          heading="One dashboard, every country's rules handled"
          body="Sender IDs, toll-free verification and local carrier registration all happen inside Xellvio — no provider portals, no paperwork chasing."
          points={[
            "Open sender IDs go live instantly in the UK, EU, Australia, Singapore and more.",
            "US and Canada run through a guided toll-free verification wizard.",
            "Markets that need carrier whitelisting are filed on your behalf and tracked in-app.",
          ]}
          visual={<GlobalVisual />}
        />
        <SplitFeature
          id="reporting"
          heading="Tap into insights you can act on"
          body="Every send is measured end to end, so you know which message, which audience and which link earned the revenue."
          points={[
            "Short links with per-campaign click tracking and your own click domain.",
            "Spend reporting by country and by message part, down to the cent.",
            "Subscriber growth, opt-out and engagement trends over time.",
          ]}
          visual={<ReportVisual />}
        />
        <ProofCards
          items={[
            { stat: "36%", label: "SMS subscriber growth", quote: "Sign-up forms and keyword opt-ins turned casual browsers into a list that keeps compounding." },
            { stat: "3.4x", label: "return on campaign spend", quote: "Segmented drops beat one-size-fits-all blasts on every metric that matters." },
            { stat: "19 min", label: "to send 20,000 texts", quote: "Large launches clear fast, with live delivery counts while the send is still running." },
          ]}
        />
        <ChannelFaq
          id="faq"
          items={[
            { q: "Do I need my own phone number?", a: "No. Xellvio provisions a sender for you — a sender ID, a toll-free number or a local number, depending on where you're texting." },
            { q: "How is SMS priced?", a: "You top up credits and pay per message part, at the rate for the destination country. Pricing is shown before you send." },
            { q: "Can people reply?", a: "Yes. Replies land in your inbox and can trigger automations or keyword responses instantly." },
            { q: "How do opt-outs work?", a: "STOP and its local equivalents are handled automatically and suppressed forever across every campaign." },
          ]}
        />
        <ChannelCta
          title="Start texting customers this afternoon"
          body="Create an account, get free credits and send your first campaign without talking to sales."
          cta={{ label: "Sign up free", to: "/auth" }}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}

/* --------------------------------- visuals -------------------------------- */

function PhoneVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-sand p-8 md:p-12">
      <div className="mx-auto w-full max-w-[300px] rounded-[30px] border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Xellvio
        </div>
        <div className="space-y-3">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground">
            Hey Maya — your size is back in stock. 15% off today with code TEXT15.
          </div>
          <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
            Sending the link now 🙌
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground">
            xelv.io/2kQ — expires at midnight.
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowVisual() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4">
        <Flag className="size-4 text-coral" />
        <span className="text-sm font-semibold text-foreground">Trigger · keyword JOIN</span>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Consented to marketing?</div>
      <div className="flex gap-2">
        <div className="rounded-xl border border-transparent bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">Yes</div>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">No</div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4">
        <Send className="size-4 text-coral" />
        <span className="text-sm text-foreground">Send welcome offer</span>
      </div>
    </div>
  );
}

function GlobalVisual() {
  const rows = [
    { r: "United Kingdom", s: "Sender ID · live" },
    { r: "United States", s: "Toll-free · verified" },
    { r: "Nigeria", s: "Carrier registration · filed" },
    { r: "Kuwait", s: "Sender ID · live" },
  ];
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-5">
      <div className="mb-4 font-bold text-foreground">Sender status</div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.r} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{row.r}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 text-success" /> {row.s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportVisual() {
  const rows = [
    { l: "Delivered", v: "19,412" },
    { l: "Clicks", v: "828" },
    { l: "Spend", v: "$154.20" },
  ];
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 font-bold text-foreground">
        <MousePointerClick className="size-4 text-coral" /> Campaign report
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{r.l}</span>
            <span className="text-sm font-semibold text-foreground">{r.v}</span>
          </div>
        ))}
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[97%] rounded-full bg-coral" />
        </div>
        <p className="text-xs text-muted-foreground">97% delivered to handsets</p>
      </div>
    </div>
  );
}
