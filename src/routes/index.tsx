import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, Globe2, Zap, ShieldCheck, BarChart3, Users, Code2, Calendar, Workflow,
  Check, MessageSquare, Sparkles, ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Samwell Global SMS — Reach Customers Worldwide" },
      { name: "description", content: "Send global SMS campaigns with confidence. Bulk messaging, automation, analytics and APIs trusted by modern businesses." },
      { property: "og:title", content: "Samwell Global SMS — Reach Customers Worldwide" },
      { property: "og:description", content: "Fast. Reliable. Compliant global SMS for businesses." },
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
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <Hero />
        <LogoBar />
        <Features />
        <HowItWorks />
        <DeliveryProcess />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <MarketingFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="hero-gradient relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-24 md:pt-28 md:pb-32 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-primary" /> Now reaching 190+ countries
          </div>
          <h1 className="mt-5 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Send <span className="text-gradient">Global SMS</span> Campaigns With Confidence
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl">
            Create campaigns, manage contacts, track delivery, and scale communication globally — all from one premium platform.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg" className="gap-2">Start Free <ArrowRight className="size-4" /></Button></Link>
            <Link to="/contact"><Button size="lg" variant="outline">Book Demo</Button></Link>
          </div>
          <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-success" /> No credit card</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-success" /> 50 free credits</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-success" /> GDPR-ready</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
          <DashboardPreview />
        </motion.div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <div className="relative card-elevated rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-destructive/70" />
          <div className="size-2 rounded-full bg-warning/80" />
          <div className="size-2 rounded-full bg-success/80" />
        </div>
        <div className="text-xs text-muted-foreground">app.samwellsms.com</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Sent", value: "1.24M", trend: "+12%" },
          { label: "Delivered", value: "98.7%", trend: "+0.4%" },
          { label: "Countries", value: "143", trend: "+8" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-background p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="font-bold text-lg mt-0.5">{s.value}</div>
            <div className="text-xs text-success font-medium">{s.trend}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-background p-4">
        <div className="text-xs font-medium text-muted-foreground mb-3">Delivery Trend (7d)</div>
        <div className="flex items-end gap-1.5 h-24">
          {[55, 70, 60, 85, 78, 92, 88].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.8, delay: 0.4 + i * 0.07 }}
              className="flex-1 bg-gradient-to-t from-primary to-primary/40 rounded-sm"
            />
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-lg border bg-background p-3 flex items-center gap-3 text-sm">
        <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center">
          <MessageSquare className="size-4" />
        </div>
        <div className="flex-1">
          <div className="font-medium">Campaign "Black Friday" sent</div>
          <div className="text-xs text-muted-foreground">12,430 recipients · 99.2% delivered</div>
        </div>
        <span className="text-xs text-success font-semibold">Live</span>
      </div>
    </div>
  );
}

function LogoBar() {
  return (
    <div className="border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-6 py-8 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Trusted by teams worldwide</p>
        <div className="mt-5 flex flex-wrap justify-center gap-x-10 gap-y-3 text-muted-foreground/70 font-bold text-lg">
          {["Northwind", "Acme Co.", "Globex", "Lumen", "Stark Corp", "Vertex"].map((n) => (
            <span key={n} className="opacity-60">{n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const features = [
  { icon: MessageSquare, title: "Bulk Messaging", text: "Send to thousands of contacts in seconds, with smart batching." },
  { icon: Calendar, title: "Scheduled Sends", text: "Plan campaigns days or weeks ahead in the recipient's timezone." },
  { icon: Globe2, title: "Global Reach", text: "190+ countries with intelligent provider routing and failover." },
  { icon: BarChart3, title: "Real-time Analytics", text: "Track delivery, opens, and ROI across every campaign." },
  { icon: Users, title: "Contact Manager", text: "Import, tag, segment, and dedupe contacts with ease." },
  { icon: Code2, title: "Developer API", text: "Send from your stack with REST, SDKs, and webhook events." },
  { icon: Workflow, title: "Automation", text: "Trigger campaigns from events, schedules, or external systems." },
  { icon: ShieldCheck, title: "Compliance", text: "Consent, opt-out, and sender ID controls built in." },
];

function Features() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-2xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Features</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">Everything you need to message at scale</h2>
          <p className="mt-3 text-muted-foreground">A complete toolkit for marketing, transactional and operational SMS.</p>
        </motion.div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <motion.div key={f.title} {...fade} transition={{ ...fade.transition, delay: i * 0.04 }}>
              <Card className="p-6 h-full hover:border-primary/40 hover:shadow-lg transition-all group">
                <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
              </Card>
            </motion.div>
          ))}
        </div>
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
    <section className="py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">How it works</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold">From signup to first send in under 5 minutes</h2>
        </motion.div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <motion.div key={s.n} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className="rounded-xl border bg-card p-6">
              <div className="text-primary font-bold">{s.n}</div>
              <h3 className="mt-2 font-semibold">{s.t}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeliveryProcess() {
  const flow = ["Dashboard", "Validation", "Queue", "Router", "Carrier", "Recipient"];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-2xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Delivery Architecture</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold">Engineered for deliverability</h2>
          <p className="mt-3 text-muted-foreground">Every message is validated, queued, routed, and tracked end-to-end across our carrier network.</p>
        </motion.div>
        <div className="mt-12 flex flex-wrap items-center gap-3 justify-center">
          {flow.map((s, i) => (
            <motion.div key={s} {...fade} transition={{ ...fade.transition, delay: i * 0.06 }} className="flex items-center gap-3">
              <div className="rounded-xl border bg-card px-5 py-3 font-medium card-elevated">{s}</div>
              {i < flow.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const items = [
    { q: "Samwell cut our messaging costs by 38% while improving delivery to Africa and Asia.", a: "Maya Chen", r: "Head of Growth, Northwind" },
    { q: "The API was a breeze — we went live in a day and handled 2M messages in the first week.", a: "Devon Park", r: "CTO, Lumen" },
    { q: "Best analytics we've used. Country-level breakdowns shaped our entire GTM.", a: "Sara Lopez", r: "Marketing Director, Globex" },
  ];
  return (
    <section className="py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-2xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Customers</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold">Loved by growth teams</h2>
        </motion.div>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {items.map((t, i) => (
            <motion.div key={i} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className="rounded-xl border bg-card p-6 card-elevated">
              <p className="text-base leading-relaxed">"{t.q}"</p>
              <div className="mt-5 text-sm">
                <div className="font-semibold">{t.a}</div>
                <div className="text-muted-foreground">{t.r}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    { name: "Starter", price: "$0", desc: "For trying things out.", features: ["500 SMS / mo", "1 sender ID", "Email support"], cta: "Start free" },
    { name: "Business", price: "$49", desc: "For growing teams.", features: ["25,000 SMS / mo", "5 sender IDs", "API access", "Priority support"], cta: "Start trial", featured: true },
    { name: "Enterprise", price: "Custom", desc: "For high-volume senders.", features: ["Unlimited volume", "Dedicated routes", "Custom integrations", "24/7 SLA"], cta: "Contact sales" },
  ];
  return (
    <section className="py-24" id="pricing">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Pricing</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold">Simple, scalable plans</h2>
          <p className="mt-3 text-muted-foreground">Pay for what you use. Upgrade anytime.</p>
        </motion.div>
        <div className="mt-12 grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {plans.map((p) => (
            <Card key={p.name} className={`p-7 ${p.featured ? "border-primary ring-2 ring-primary/30 relative" : ""}`}>
              {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>}
              <div className="font-semibold">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">{p.price}</span>
                {p.price !== "Custom" && <span className="text-muted-foreground">/mo</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="size-4 text-success shrink-0 mt-0.5" /> {f}</li>
                ))}
              </ul>
              <Link to="/auth" className="block mt-6">
                <Button className="w-full" variant={p.featured ? "default" : "outline"}>{p.cta}</Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    { q: "Which countries do you support?", a: "We deliver to 190+ countries through multiple tier-1 carriers with automatic routing and failover." },
    { q: "How is pricing calculated?", a: "SMS is priced per segment per destination. View live country pricing inside your dashboard." },
    { q: "Do you provide a developer API?", a: "Yes — REST API with SDKs, webhooks for delivery events, and a sandbox for testing." },
    { q: "Is bulk messaging compliant?", a: "We enforce opt-out handling, consent records, and sender ID rules per region." },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div {...fade} className="text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">FAQ</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold">Frequently asked questions</h2>
        </motion.div>
        <div className="mt-10 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border bg-card">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left font-semibold">
                {f.q}
                <ChevronDown className={`size-4 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="px-5 pb-5 text-sm text-muted-foreground">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <motion.div {...fade} className="rounded-2xl bg-secondary text-secondary-foreground p-10 md:p-14 text-center card-elevated relative overflow-hidden">
          <div className="absolute inset-0 hero-gradient opacity-20" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-extrabold">Ready to reach the world?</h2>
            <p className="mt-3 text-secondary-foreground/80">Start free with 50 credits. No card required.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/auth"><Button size="lg">Start Free <ArrowRight className="size-4 ml-1" /></Button></Link>
              <Link to="/contact"><Button size="lg" variant="outline" className="bg-transparent border-white/30 text-white hover:bg-white/10">Talk to sales</Button></Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Zap2() { return <Zap className="size-4" />; }
void Zap2;
