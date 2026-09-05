import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowUpRight, Check, Sparkles, Smartphone, BarChart3, Users, Workflow,
} from "lucide-react";
import { reveal } from "@/components/marketing/ProductKit";

type Pillar = {
  eyebrow: string;
  title: string;
  body: string;
  cta: { label: string; to: string };
  tags: string[];
  visual: React.ReactNode;
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-[24px] bg-muted p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, color-mix(in oklab, var(--coral) 12%, transparent) 0, transparent 45%), radial-gradient(circle at 85% 80%, color-mix(in oklab, var(--primary) 12%, transparent) 0, transparent 45%)",
        }}
      />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}

function MessagingVisual() {
  return (
    <Frame>
      <div className="space-y-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Smartphone className="size-3.5" /> SMS · 217,290 contacts
          </div>
          <p className="mt-3 text-sm text-foreground">
            Hey Amara — your cart is still waiting. 15% off ends tonight.
          </p>
          <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Sent</span>
        </div>
        <div className="ml-8 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Smartphone className="size-3.5" /> SMS · follow-up
          </div>
          <p className="mt-3 text-sm text-foreground">30+ new pieces just landed in your size.</p>
          <span className="mt-3 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Queued</span>
        </div>

      </div>
    </Frame>
  );
}

function AiVisual() {
  return (
    <Frame>
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs text-muted-foreground">Xellvio AI · drafted in 6 seconds</p>
        <div className="mt-4 space-y-3">
          {[
            { t: "Split the audience by reply history", w: "Repliers convert 2.3× more — text them first." },
            { t: "Shorten every link in the send", w: "Keeps you under 160 characters and tracks clicks." },
          ].map((r) => (
            <div key={r.t} className="rounded-xl border border-border p-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid size-4 place-items-center rounded-[4px] bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.t}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.w}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
          <Sparkles className="size-4 text-coral" />
          <span className="text-sm text-muted-foreground">Ask Xellvio anything…</span>
        </div>
      </div>
    </Frame>
  );
}

function AutomationVisual() {
  return (
    <Frame>
      <div className="space-y-2.5">
        <div className="rounded-xl border bg-card px-4 py-3 text-sm font-semibold text-primary shadow-sm">Trigger · joined a list</div>
        <div className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">Wait 30 minutes</div>
        <div className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">Clicked the link?</div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-sm">Yes → offer</div>
          <div className="flex-1 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-sm">No → nudge</div>
        </div>
      </div>
    </Frame>
  );
}

function AnalyticsVisual() {
  const bars = [42, 58, 34, 76, 88, 61, 70];
  return (
    <Frame>
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="text-sm font-bold text-foreground">Revenue by campaign</div>
        <div className="mt-6 flex h-32 items-end gap-2.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 space-y-1">
              <div className="rounded-t-[4px] bg-primary" style={{ height: `${h}%` }} />
              <div className="rounded-b-[4px] bg-coral/40" style={{ height: `${Math.max(8, h / 3)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" /> SMS</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-coral/40" /> Clicks</span>
        </div>
      </div>
    </Frame>
  );
}

function AudienceVisual() {
  return (
    <Frame>
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-muted text-sm font-bold text-foreground">JF</div>
          <div>
            <div className="text-sm font-bold text-foreground">Jane Foster</div>
            <div className="text-xs text-muted-foreground">+1 415 ••• 2210 · VIP</div>
          </div>
        </div>
        <dl className="mt-5 space-y-2.5 text-sm">
          {[
            ["Lifetime value", "$4,583.09"],
            ["Replies sent", "12"],
            ["Last click", "2 days ago"],
            ["Consent", "SMS opted in"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-semibold text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Frame>
  );
}

const PILLARS: Pillar[] = [
  {
    eyebrow: "Messaging",
    title: "Marketing that keeps the conversation going",
    body: "Run every text from one audience, one calendar and one set of numbers — every message reacts to what people actually do.",
    cta: { label: "Explore messaging", to: "/sms-marketing" },
    tags: ["SMS campaigns", "Two-way inbox", "Link tracking"],
    visual: <MessagingVisual />,
  },
  {
    eyebrow: "Xellvio AI",
    title: "AI built for every customer moment",
    body: "Draft copy, build a landing page, tidy an audience or rewrite a whole send — then review the suggestions before anything goes out.",
    cta: { label: "Explore AI", to: "/features" },
    tags: ["Copy assistant", "Website builder AI", "Send optimisation"],
    visual: <AiVisual />,
  },
  {
    eyebrow: "Automations",
    title: "Journeys that run without you",
    body: "Welcome series, abandoned carts, replies and win-backs run on their own, with branching, waits and goals you can see end to end.",
    cta: { label: "Explore automations", to: "/features" },
    tags: ["Flows", "Keyword replies", "Sign-up forms"],
    visual: <AutomationVisual />,
  },
  {
    eyebrow: "Analytics",
    title: "Reporting that shows your next win",
    body: "Delivery, clicks, replies, spend and revenue for every send — per country, per carrier, per campaign, with nothing to reconcile.",
    cta: { label: "Explore analytics", to: "/features" },
    tags: ["Attribution", "Spend reporting", "Deliverability"],
    visual: <AnalyticsVisual />,
  },
  {
    eyebrow: "Audience data",
    title: "One profile for every customer",
    body: "Contacts, consent, orders and engagement live together, so segments stay accurate and nobody gets a message they didn't ask for.",
    cta: { label: "Explore audience data", to: "/features" },
    tags: ["Segments", "Consent tracking", "Suppressions"],
    visual: <AudienceVisual />,
  },
];

const ICONS = [Smartphone, Sparkles, Workflow, BarChart3, Users];

export function PlatformShowcase() {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.p {...reveal} className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          The Xellvio platform
        </motion.p>
        <motion.h2 {...reveal} className="mt-4 max-w-3xl text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          Everything you need to talk to customers — not just texting
        </motion.h2>
        <motion.p {...reveal} className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Messaging, AI, automations, reporting and audience data in a single platform, so your team stops stitching tools together.
        </motion.p>

        <div className="mt-16 grid gap-x-10 gap-y-16 md:grid-cols-2">
          {PILLARS.map((p, i) => {
            const Icon = ICONS[i];
            return (
              <motion.article
                key={p.title}
                {...reveal}
                transition={{ ...reveal.transition, delay: (i % 2) * 0.06 }}
                className="flex flex-col"
              >
                {p.visual}
                <div className="mt-7 flex items-center gap-2">
                  <Icon className="size-4 text-coral" strokeWidth={1.8} />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{p.eyebrow}</span>
                </div>
                <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{p.title}</h3>
                <p className="mt-4 flex-1 text-muted-foreground">{p.body}</p>
                <Link
                  to={p.cta.to}
                  className="group mt-6 inline-flex w-fit items-center gap-1.5 border-b-2 border-foreground pb-0.5 text-sm font-bold text-foreground"
                >
                  {p.cta.label}
                  <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <div className="mt-6 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
