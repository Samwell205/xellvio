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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SAMWELL SMS HUB — Reach Customers Worldwide" },
      { name: "description", content: "Send global SMS campaigns with confidence. Bulk messaging, automation, analytics and APIs trusted by modern businesses." },
      { property: "og:title", content: "SAMWELL SMS HUB — Reach Customers Worldwide" },
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
    <div className="min-h-screen flex flex-col cream-bg">
      <MarketingNav />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <EditorialActivity />
        <EditorialAttribution />
        <EditorialReach />
        <HowItWorks />
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
    <section className="cream-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-neutral-600">SAMWELL SMS HUB</p>
          <h1 className="mt-4 text-5xl sm:text-6xl md:text-[64px] font-extrabold tracking-tight leading-[1.02] text-neutral-950">
            SMS marketing<br/>built for smarter sends
          </h1>
          <p className="mt-6 text-lg text-neutral-700 max-w-xl">
            Reach, convert, and retain customers with personalized, timely conversations — all powered by automation and unified data.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/auth" className="ink-btn">Sign up <ArrowRight className="size-4" /></Link>
            <Link to="/contact" className="ghost-btn">Take a tour</Link>
          </div>
          <div className="mt-8 flex items-center gap-6 text-xs text-neutral-600">
            <span className="flex items-center gap-1.5"><Check className="size-3.5" /> No credit card</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5" /> 50 free credits</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5" /> GDPR-ready</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
          <div className="cream-panel rounded-3xl p-10 md:p-14 min-h-[460px] relative overflow-hidden">
            {/* Decorative dot pattern emulating editorial product photo */}
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.6) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.06) 0, transparent 45%)" }} />
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="editorial-card relative p-5 max-w-xs ml-auto"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-md bg-neutral-100 grid place-items-center"><Flag className="size-4 text-neutral-700" /></div>
                <span className="font-semibold text-neutral-900">Trigger</span>
              </div>
              <div className="text-sm text-neutral-600 mb-2">Keyword</div>
              <div className="chip-blue rounded-md px-3 py-2 text-sm font-medium">Supplement quiz</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="editorial-card relative p-5 max-w-[280px] mt-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-md bg-neutral-100 grid place-items-center"><Send className="size-4 text-neutral-700" /></div>
                <span className="font-semibold text-neutral-900">Message 2</span>
              </div>
              <div className="text-sm text-neutral-700 mb-3">How many servings of fruit do you eat daily?</div>
              <div className="space-y-1.5">
                <div className="rounded-md border border-neutral-200 px-3 py-2 text-sm">0–2 servings</div>
                <div className="chip-blue rounded-md px-3 py-2 text-sm font-medium">3–5</div>
                <div className="rounded-md border border-neutral-200 px-3 py-2 text-sm">6+</div>
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
    <section className="cream-bg pt-8 pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2 {...fade} className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-950 max-w-2xl">
          Text your way to better results
        </motion.h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {features.map((f, i) => (
            <motion.div key={f.title} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }}>
              <f.icon className="size-7 text-[#e85d3a]" strokeWidth={1.6} />
              <h3 className="mt-5 font-bold text-neutral-950 text-lg leading-snug">{f.title}</h3>
              <p className="mt-3 text-sm text-neutral-700 leading-relaxed">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditorialActivity() {
  return (
    <section className="cream-bg py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...fade} className="blush-panel rounded-3xl p-10 md:p-14 min-h-[420px] flex items-center justify-center">
          <div className="editorial-card w-full max-w-sm p-5">
            <div className="font-bold text-neutral-900 mb-4">Activity log</div>
            <div className="space-y-3">
              {[
                { i: Mail, t: "Opened a cross-sell SMS", d: "Today · 12:45 PM" },
                { i: Check, t: "Submitted a review", d: "Today · 7:03 AM" },
                { i: Send, t: "Checkout started", d: "Yesterday · 5:11 PM" },
                { i: MousePointerClick, t: "Viewed product", d: "Nov 24 · 2:13 PM" },
                { i: Sparkles, t: "Received SMS quiz", d: "Nov 11 · 5:45 PM" },
              ].map((r, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="size-8 rounded-md bg-neutral-100 grid place-items-center shrink-0">
                    <r.i className="size-4 text-neutral-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 truncate">{r.t}</div>
                    <div className="text-xs text-neutral-500">{r.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div {...fade}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-950">The data to deliver text messages your customers want</h2>
          <p className="mt-5 text-neutral-700">Stronger customer relationships start with the best data, so you send the timely, relevant texts they actually want to receive.</p>
          <ul className="mt-6 space-y-4 text-neutral-800">
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
    <section className="cream-bg py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...fade}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-950">Reach customers across channels, and across the globe</h2>
          <p className="mt-5 text-neutral-700">With all your channels in one platform, it's easy to combine SMS, email, and mobile messaging into global omnichannel experiences.</p>
          <ul className="mt-6 space-y-4 text-neutral-800">
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Meet customers anywhere with multi-channel flows.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Engage globally — SMS available in 190+ countries.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Send confidently with built-in compliance and trust.</li>
          </ul>
        </motion.div>
        <motion.div {...fade} className="moss-panel rounded-3xl p-10 md:p-14 min-h-[420px] flex items-center justify-center">
          <div className="space-y-3 w-full max-w-sm">
            <div className="editorial-card chip-blue px-4 py-3 text-sm font-semibold">FLOW TRIGGER</div>
            <div className="editorial-card px-4 py-3 text-sm">Price dropped and item viewed</div>
            <div className="editorial-card px-4 py-3 text-sm">Consented to receive SMS?</div>
            <div className="flex gap-2">
              <div className="editorial-card chip-blue px-4 py-2 text-sm font-semibold">Yes</div>
              <div className="editorial-card px-4 py-2 text-sm">No</div>
            </div>
            <div className="editorial-card px-4 py-3 text-sm">View discounted item</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function EditorialAttribution() {
  return (
    <section className="cream-bg py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...fade} className="cream-panel rounded-3xl p-10 md:p-14 min-h-[420px] flex items-center justify-center">
          <div className="editorial-card w-full max-w-sm p-5">
            <div className="font-bold text-neutral-900 mb-4">Attribution windows</div>
            <div className="space-y-3">
              {[
                { l: "Opened email", v: "10 days" },
                { l: "Clicked SMS", v: "24 hours", active: true },
                { l: "Opened push", v: "5 days" },
              ].map((r) => (
                <div key={r.l} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="size-4 rounded-sm bg-neutral-200 grid place-items-center"><Check className="size-3 text-neutral-700" /></div>
                    <span className="text-sm text-neutral-800">{r.l}</span>
                  </div>
                  <div className={`px-3 py-1.5 text-xs rounded-md border ${r.active ? "chip-blue border-transparent font-medium" : "border-neutral-200"}`}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div {...fade}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-950">Tap into actionable SMS insights</h2>
          <p className="mt-5 text-neutral-700">Make smarter decisions for your SMS strategy with built-in multi-channel reporting.</p>
          <ul className="mt-6 space-y-4 text-neutral-800">
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Accurately attribute sales with last-touch multi-channel attribution.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Manage budgets with usage reporting across every channel.</li>
            <li className="flex gap-3"><span className="size-1.5 rounded-full bg-neutral-900 mt-2.5 shrink-0" /> Analyze subscriber growth and engagement trends over time.</li>
          </ul>
        </motion.div>
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
    <section className="cream-bg py-20 border-t border-neutral-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2 {...fade} className="text-3xl sm:text-4xl font-extrabold text-neutral-950 max-w-2xl">From signup to first send in under 5 minutes</motion.h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div key={s.n} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className="border-t border-neutral-900 pt-5">
              <div className="text-neutral-500 font-mono text-sm">{s.n}</div>
              <h3 className="mt-2 font-bold text-neutral-950 text-lg">{s.t}</h3>
              <p className="mt-2 text-sm text-neutral-700">{s.d}</p>
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
    <section className="cream-bg py-24" id="pricing">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div {...fade} className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-950">Simple, scalable plans</h2>
          <p className="mt-3 text-neutral-700">Pay for what you use. Upgrade anytime.</p>
        </motion.div>
        <div className="mt-12 grid md:grid-cols-3 gap-5 max-w-5xl">
          {plans.map((p) => (
            <div key={p.name} className={`rounded-2xl bg-white p-7 ${p.featured ? "ring-2 ring-neutral-900" : "border border-neutral-200"}`}>
              {p.featured && <span className="inline-block mb-3 rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <div className="font-semibold text-neutral-900">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-neutral-950">{p.price}</span>
                {p.price !== "Custom" && <span className="text-neutral-600">/mo</span>}
              </div>
              <p className="mt-1 text-sm text-neutral-600">{p.desc}</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-neutral-800"><Check className="size-4 shrink-0 mt-0.5" /> {f}</li>
                ))}
              </ul>
              <Link to="/auth" className={`mt-6 ${p.featured ? "ink-btn" : "ghost-btn"} w-full justify-center`}>{p.cta}</Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    { q: "What is SMS marketing?", a: "SMS marketing is the practice of sending customers and prospects marketing messages, promotions, reminders, and more by text message." },
    { q: "Why is SMS marketing important?", a: "Text messages have 98% open rates and reach customers instantly — making SMS the most direct channel for engagement." },
    { q: "Is SMS marketing effective?", a: "Yes — brands using SMS see significant lifts in conversion when combined with personalized segmentation and timing." },
    { q: "What are some SMS best practices?", a: "Get explicit consent, keep messages short, identify your brand, and include a clear opt-out." },
    { q: "How does SAMWELL charge for SMS?", a: "Pay-as-you-go credits priced per segment per destination country. Live rates inside your dashboard." },
    { q: "Which countries is SMS available in?", a: "We deliver to 190+ countries via tier-1 carriers with automatic routing and failover." },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="cream-bg py-24 border-t border-neutral-200">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <motion.h2 {...fade} className="text-3xl sm:text-4xl font-extrabold text-neutral-950">SMS marketing FAQ</motion.h2>
        <div className="mt-12">
          {faqs.map((f, i) => (
            <div key={i} className="border-b border-neutral-300">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between py-6 text-left font-semibold text-neutral-900">
                {f.q}
                <ChevronDown className={`size-5 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && <p className="pb-6 text-neutral-700 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="cream-bg py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-neutral-950 text-white p-12 md:p-16 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 size-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(207,230,251,0.25), transparent 70%)" }} />
          <div className="relative max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Ready to reach the world?</h2>
            <p className="mt-4 text-white/70 text-lg">Start free with 50 credits. No card required.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth"><Button size="lg" className="rounded-full bg-white text-neutral-950 hover:bg-white/90 font-semibold px-6">Sign up <ArrowRight className="size-4 ml-1" /></Button></Link>
              <Link to="/contact"><Button size="lg" variant="outline" className="rounded-full bg-transparent border-white/40 text-white hover:bg-white/10 font-semibold px-6"><Play className="size-4 mr-1.5" /> Take a tour</Button></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// silence unused imports kept for future variants
void Card; void ShieldCheck; void Users; void Code2; void Calendar; void Workflow; void Smartphone; void Activity;
