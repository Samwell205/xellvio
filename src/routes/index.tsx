import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, Globe2, ShieldCheck, BarChart3, Users, Code2, Calendar, Workflow,
  Check, MessageSquare, Sparkles, ChevronDown, Activity, Send, MousePointerClick,
  Mail, Smartphone, Flag, Play,
} from "lucide-react";
import { useState } from "react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { PlatformShowcase } from "@/components/marketing/PlatformShowcase";
import { StatsMarquee, reveal } from "@/components/marketing/ProductKit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const CHANNELS = [
  {
    to: "/sms-marketing",
    label: "SMS marketing",
    tag: "Live today",
    body: "Two-way texting in 190+ countries, with automations, link tracking and every country's sender rules handled for you.",
    icon: Smartphone,
  },
  {
    to: "/email-marketing",
    label: "Email marketing",
    tag: "Early access",
    body: "Design campaigns, automate follow-ups and report on email beside your texts — one shared audience, one set of numbers.",
    icon: Mail,
  },
] as const;

function Channels() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2 {...reveal} className="max-w-2xl text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Pick a channel. Or run both from one place.
        </motion.h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {CHANNELS.map((c, i) => (
            <motion.div key={c.to} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}>
              <Link
                to={c.to}
                className="group flex h-full flex-col rounded-[28px] border border-border bg-card p-8 transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <c.icon className="size-6 text-coral" strokeWidth={1.7} />
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {c.tag}
                  </span>
                </div>
                <h3 className="mt-6 text-2xl font-extrabold tracking-tight text-foreground">{c.label}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-all group-hover:gap-3">
                  Explore {c.label.split(" ")[0]} <ArrowRight className="size-4" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}


const HOME_TITLE = "Xellvio: SMS Marketing & Customer Messaging Platform";
const HOME_DESCRIPTION =
  "Xellvio is the customer messaging platform that unifies SMS, email, automations, AI and reporting — send bulk campaigns to 190+ countries, reply in a shared inbox and track every click and conversion.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:url", content: "https://xellvio.com/" },
    ],
    links: [{ rel: "canonical", href: "https://xellvio.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://xellvio.com/#website",
              url: "https://xellvio.com/",
              name: "Xellvio",
              description: HOME_DESCRIPTION,
              inLanguage: "en",
              publisher: { "@id": "https://xellvio.com/#organization" },
            },
            {
              "@type": "SoftwareApplication",
              name: "Xellvio",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://xellvio.com/",
              description: HOME_DESCRIPTION,
              featureList: [
                "Bulk SMS campaigns",
                "SMS automations and flows",
                "Two-way messaging inbox",
                "Audience lists and segments",
                "Link tracking and delivery analytics",
                "Landing pages and sign-up forms",
                "Email marketing",
                "Developer API and webhooks",
              ],
              offers: {
                "@type": "Offer",
                url: "https://xellvio.com/pricing",
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
              },
              publisher: { "@id": "https://xellvio.com/#organization" },
            },
            {
              "@type": "SiteNavigationElement",
              name: [
                "SMS marketing",
                "Email marketing",
                "Features",
                "Pricing",
                "Solutions",
                "Documentation",
                "Contact",
              ],
              url: [
                "https://xellvio.com/sms-marketing",
                "https://xellvio.com/email-marketing",
                "https://xellvio.com/features",
                "https://xellvio.com/pricing",
                "https://xellvio.com/solutions",
                "https://xellvio.com/docs",
                "https://xellvio.com/contact",
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: HomePage,
});


const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingNav />
      <main className="flex-1">
        <Hero />
        <StatsMarquee
          stats={[
            { value: "190+", label: "countries reached" },
            { value: "5,000", label: "messages per minute" },
            { value: "98%", label: "average delivery rate" },
            { value: "24/7", label: "delivery monitoring" },
          ]}
        />
        <Channels />
        <PlatformShowcase />
        <FeatureGrid />
        <EditorialActivity />
        <EditorialAttribution />
        <EditorialReach />
        <SenderIdExplainer />
        <HowItWorks />
        <FAQ />
        <CTA />
      </main>

      <MarketingFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">Xellvio</p>
          <h1 className="mt-4 text-5xl sm:text-6xl md:text-[64px] font-extrabold tracking-tight leading-[1.02] text-foreground">
            One platform for<br/>every customer message
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl">
            SMS, email, automations, AI, reporting and integrations in one place — so every conversation reacts to what your customers actually do.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/auth" className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-5 py-3 font-semibold hover:bg-primary/90 transition-colors">Sign up <ArrowRight className="size-4" /></Link>
            <Link to="/contact" className="inline-flex items-center gap-1.5 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-full px-5 py-3 font-semibold transition-colors">Take a tour</Link>
          </div>
          <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="size-3.5" /> No credit card</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5" /> 50 free credits</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5" /> GDPR-ready</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
          <div className="bg-muted rounded-3xl p-10 md:p-14 min-h-[460px] relative overflow-hidden">
            {/* Decorative dot pattern emulating editorial product photo */}
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.6) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.06) 0, transparent 45%)" }} />
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-card rounded-xl border shadow-sm relative p-5 max-w-xs ml-auto"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-md bg-muted grid place-items-center"><Flag className="size-4 text-muted-foreground" /></div>
                <span className="font-semibold text-foreground">Trigger</span>
              </div>
              <div className="text-sm text-muted-foreground mb-2">Keyword</div>
              <div className="bg-primary/10 text-primary rounded-md px-3 py-2 text-sm font-medium">Supplement quiz</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="bg-card rounded-xl border shadow-sm relative p-5 max-w-[280px] mt-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-md bg-muted grid place-items-center"><Send className="size-4 text-muted-foreground" /></div>
                <span className="font-semibold text-foreground">Message 2</span>
              </div>
              <div className="text-sm text-muted-foreground mb-3">How many servings of fruit do you eat daily?</div>
              <div className="space-y-1.5">
                <div className="rounded-md border border-border px-3 py-2 text-sm">0–2 servings</div>
                <div className="bg-primary/10 text-primary rounded-md px-3 py-2 text-sm font-medium">3–5</div>
                <div className="rounded-md border border-border px-3 py-2 text-sm">6+</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const features = [
  { icon: MessageSquare, title: "Power personalization with better data", text: "Deliver exactly what each customer needs with built-in data, segments and two-way conversations." },
  { icon: Globe2, title: "Meet users where they are, worldwide", text: "Engage customers around the world with SMS reaching 190+ countries on tier-1 carriers." },
  { icon: Sparkles, title: "Grow faster with automation & optimization", text: "Automated A/B testing and list-growth tools drive more SMS revenue, even faster." },
  { icon: BarChart3, title: "Take action with clear, omnichannel insights", text: "Know your next move with multi-channel attribution and revenue reporting." },
];

function FeatureGrid() {
  return (
    <section className="bg-background pt-8 pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2 {...fade} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground max-w-2xl">
          Text your way to better results
        </motion.h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {features.map((f, i) => (
            <motion.div key={f.title} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }}>
              <f.icon className="size-7 text-primary" strokeWidth={1.6} />
              <h3 className="mt-5 font-bold text-foreground text-lg leading-snug">{f.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditorialActivity() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...fade} className="bg-muted rounded-3xl p-10 md:p-14 min-h-[420px] flex items-center justify-center">
          <div className="bg-card rounded-xl border shadow-sm w-full max-w-sm p-5">
            <div className="font-bold text-foreground mb-4">Activity log</div>
            <div className="space-y-3">
              {[
                { i: Mail, t: "Opened a cross-sell SMS", d: "Today · 12:45 PM" },
                { i: Check, t: "Submitted a review", d: "Today · 7:03 AM" },
                { i: Send, t: "Checkout started", d: "Yesterday · 5:11 PM" },
                { i: MousePointerClick, t: "Viewed product", d: "Nov 24 · 2:13 PM" },
                { i: Sparkles, t: "Received SMS quiz", d: "Nov 11 · 5:45 PM" },
              ].map((r, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="size-8 rounded-md bg-muted grid place-items-center shrink-0">
                    <r.i className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{r.t}</div>
                    <div className="text-xs text-muted-foreground">{r.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div {...fade}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">The data to deliver text messages your customers want</h2>
          <p className="mt-5 text-muted-foreground">Stronger customer relationships start with the best data, so you send the timely, relevant texts they actually want to receive.</p>
          <ul className="mt-6 space-y-4 text-muted-foreground">
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Quickly segment, personalize, and act on insights with our unified data platform.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Automated SMS conversations to address FAQs and tailor experiences.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Collect transactional consent separately from marketing for full subscriber control.</li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

function EditorialReach() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...fade}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Reach customers across channels, and across the globe</h2>
          <p className="mt-5 text-muted-foreground">With all your channels in one platform, it's easy to combine SMS, email, and mobile messaging into global omnichannel experiences.</p>
          <ul className="mt-6 space-y-4 text-muted-foreground">
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Meet customers anywhere with multi-channel flows.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Engage globally — SMS available in 190+ countries.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Send confidently with built-in compliance and trust.</li>
          </ul>
        </motion.div>
        <motion.div {...fade} className="bg-muted rounded-3xl p-10 md:p-14 min-h-[420px] flex items-center justify-center">
          <div className="space-y-3 w-full max-w-sm">
            <div className="bg-card rounded-xl border shadow-sm bg-primary/10 text-primary px-4 py-3 text-sm font-semibold">FLOW TRIGGER</div>
            <div className="bg-card rounded-xl border shadow-sm px-4 py-3 text-sm">Price dropped and item viewed</div>
            <div className="bg-card rounded-xl border shadow-sm px-4 py-3 text-sm">Consented to receive SMS?</div>
            <div className="flex gap-2">
              <div className="bg-card rounded-xl border shadow-sm bg-primary/10 text-primary px-4 py-2 text-sm font-semibold">Yes</div>
              <div className="bg-card rounded-xl border shadow-sm px-4 py-2 text-sm">No</div>
            </div>
            <div className="bg-card rounded-xl border shadow-sm px-4 py-3 text-sm">View discounted item</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function EditorialAttribution() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...fade} className="bg-muted rounded-3xl p-10 md:p-14 min-h-[420px] flex items-center justify-center">
          <div className="bg-card rounded-xl border shadow-sm w-full max-w-sm p-5">
            <div className="font-bold text-foreground mb-4">Attribution windows</div>
            <div className="space-y-3">
              {[
                { l: "Opened email", v: "10 days" },
                { l: "Clicked SMS", v: "24 hours", active: true },
                { l: "Opened push", v: "5 days" },
              ].map((r) => (
                <div key={r.l} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="size-4 rounded-sm bg-muted grid place-items-center"><Check className="size-3 text-muted-foreground" /></div>
                    <span className="text-sm text-muted-foreground">{r.l}</span>
                  </div>
                  <div className={`px-3 py-1.5 text-xs rounded-md border ${r.active ? "bg-primary/10 text-primary border-transparent font-medium" : "border-border"}`}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div {...fade}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">Tap into actionable SMS insights</h2>
          <p className="mt-5 text-muted-foreground">Make smarter decisions for your SMS strategy with built-in multi-channel reporting.</p>
          <ul className="mt-6 space-y-4 text-muted-foreground">
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Accurately attribute sales with last-touch multi-channel attribution.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Manage budgets with usage reporting across every channel.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Analyze subscriber growth and engagement trends over time.</li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

function SenderIdExplainer() {
  const rows = [
    {
      region: "United States & Canada",
      req: "Toll-free verification",
      what: "Fill a short business & opt-in form inside your dashboard. We reserve the toll-free number and submit it to the carrier for you. Approval usually takes 1–3 weeks.",
      tone: "amber",
    },
    {
      region: "Countries that allow open Sender IDs",
      sub: "UK, Australia, Germany, France, Spain, Netherlands, Ireland, Denmark, Poland, Singapore, and more",
      req: "No registration",
      what: "Just pick a Sender ID (3–11 letters/numbers). It's active instantly — no forms, no waiting.",
      tone: "emerald",
    },
    {
      region: "Countries that require carrier registration",
      sub: "Nigeria, Ghana, Kenya, South Africa, Mexico, Brazil, India, UAE, and more",
      req: "Sender ID registration",
      what: "Submit the Sender ID you want and we register it with the local carriers on your behalf. No provider portal or business form for you — status shows In review until carriers approve.",
      tone: "blue",
    },
  ];
  const toneMap: Record<string, string> = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };
  return (
    <section className="bg-background py-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">How SMS delivery works</p>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            One dashboard. Every country's rules handled for you.
          </h2>
          <p className="mt-5 text-muted-foreground">
            Each country regulates SMS a little differently. You never leave Xellvio — we handle whichever
            path applies to where you're sending, and each account does its own verification right inside the app.
          </p>
        </motion.div>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {rows.map((r, i) => (
            <motion.div key={r.region} {...fade} transition={{ ...fade.transition, delay: i * 0.06 }}>
              <Card className="p-6 h-full flex flex-col">
                <div className={`inline-flex self-start items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${toneMap[r.tone]}`}>
                  <ShieldCheck className="size-3.5" /> {r.req}
                </div>
                <h3 className="mt-4 font-bold text-foreground text-lg leading-snug">{r.region}</h3>
                {r.sub && <p className="mt-1 text-xs text-muted-foreground">{r.sub}</p>}
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{r.what}</p>
              </Card>
            </motion.div>
          ))}
        </div>
        <motion.p {...fade} className="mt-10 text-sm text-muted-foreground max-w-3xl">
          <strong className="text-foreground">Bottom line:</strong> for most of the world, you just pick a Sender ID
          and send. For the US and Canada, we walk you through the toll-free verification wizard.
          For countries that need local carrier whitelisting, we file the request for you — no external portal, no paperwork.
        </motion.p>
      </div>
    </section>
  );
}


function HowItWorks() {
  const steps = [
    { n: "01", t: "Create account", d: "Sign up free and receive 50 credits to start." },
    { n: "02", t: "Import contacts", d: "Upload CSV, tag and segment your audience." },
    { n: "03", t: "Send or schedule", d: "Draft, preview, and launch in minutes." },
    { n: "04", t: "Track & optimize", d: "Real-time delivery dashboards and reports." },
  ];
  return (
    <section className="bg-background py-20 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2 {...fade} className="text-3xl sm:text-4xl font-extrabold text-foreground max-w-2xl">From signup to first send in under 5 minutes</motion.h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div key={s.n} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className="border-t border-foreground pt-5">
              <div className="text-muted-foreground font-mono text-sm">{s.n}</div>
              <h3 className="mt-2 font-bold text-foreground text-lg">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}


function FAQ() {
  const faqs = [
    {
      q: "What is Xellvio?",
      a: "Xellvio is a customer messaging platform for growing businesses. It brings SMS and email campaigns, automations, a two-way inbox, sign-up forms, landing pages and reporting into one place, so every message can react to what a customer actually does.",
    },
    {
      q: "How much does Xellvio cost? Is there a free plan?",
      a: "Xellvio is pay-as-you-go: you buy credits and each message is priced per segment for the destination country, with live rates shown before you send. New accounts start with 50 free credits and no card is required.",
    },
    {
      q: "Which channels does Xellvio support?",
      a: "SMS and MMS today, with two-way replies and keyword automations. Email campaigns and flows run beside your texts from the same audience.",
    },
    {
      q: "Which countries can I send to?",
      a: "Over 190 countries through tier-1 carriers, with automatic routing, failover and each country's sender rules handled for you — including toll-free, 10DLC and sender ID registration where it's required.",
    },
    {
      q: "Does Xellvio handle consent and opt-outs?",
      a: "Yes. Consent, opt-out keywords and suppressions are tracked on every contact, so anyone who unsubscribes is excluded from future sends automatically.",
    },
    {
      q: "Can I automate messages?",
      a: "Yes. Build flows that trigger on sign-ups, replies, keywords, abandoned carts or your own events, with waits, branches, conditions and goals you can follow end to end.",
    },
    {
      q: "How do I see what a campaign earned?",
      a: "Every send reports delivery, clicks, replies, spend and revenue — per country, per carrier and per campaign — with exportable reports.",
    },
    {
      q: "Can I connect Xellvio to my other tools?",
      a: "Yes. Connect your store, forms and CRM, or build directly on the Xellvio API and webhooks.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-background py-24 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <motion.h2 {...fade} className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
          Frequently asked questions
        </motion.h2>
        <div>
          {faqs.map((f, i) => (
            <div key={i} className="border-b border-border">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="w-full flex items-start justify-between gap-6 py-6 text-left text-lg sm:text-xl font-bold text-foreground"
              >
                {f.q}
                <ChevronDown className={`mt-1 size-5 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="pb-7 max-w-2xl text-muted-foreground leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-neutral-950 text-white p-12 md:p-16 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 size-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(207,230,251,0.25), transparent 70%)" }} />
          <div className="relative max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Ready to reach the world?</h2>
            <p className="mt-4 text-white/70 text-lg">Start free with 50 credits. No card required.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth"><Button size="lg" className="rounded-full bg-card text-foreground hover:bg-card/90 font-semibold px-6">Sign up <ArrowRight className="size-4 ml-1" /></Button></Link>
              <Link to="/contact"><Button size="lg" variant="outline" className="rounded-full bg-transparent border-white/40 text-white hover:bg-card/10 font-semibold px-6"><Play className="size-4 mr-1.5" /> Take a tour</Button></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// silence unused imports kept for future variants
void Card; void ShieldCheck; void Users; void Code2; void Calendar; void Workflow; void Smartphone; void Activity;
