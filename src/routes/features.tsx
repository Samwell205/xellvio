import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  MessageSquare, Calendar, Tag, BarChart3, Users, Code2, Workflow, Settings2, ArrowRight,
} from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — SAMWELL SMS HUB" },
      { name: "description", content: "Bulk messaging, scheduling, analytics, contact management, API and automation built for global SMS." },
      { property: "og:title", content: "Features — SAMWELL SMS HUB" },
      { property: "og:description", content: "Everything you need for global SMS at scale." },
    ],
  }),
  component: FeaturesPage,
});

const items = [
  { icon: MessageSquare, title: "Bulk Messaging", text: "Send to millions in minutes with smart batching, throttling, and retries." },
  { icon: Calendar, title: "Scheduled Messaging", text: "Plan campaigns days or weeks ahead, in the recipient's local timezone." },
  { icon: Tag, title: "Sender ID", text: "Use approved sender IDs per country with automatic fallback rules." },
  { icon: BarChart3, title: "Analytics", text: "Real-time delivery, country breakdown, and exportable reports." },
  { icon: Users, title: "Contact Management", text: "Tags, segments, import/export, dedupe and opt-out workflows." },
  { icon: Code2, title: "Developer API", text: "REST API, SDKs, and webhook events for delivery updates." },
  { icon: Workflow, title: "Campaign Automation", text: "Trigger campaigns from CRM events, schedules or webhooks." },
  { icon: Settings2, title: "Developer Tools", text: "Sandbox, logs, test numbers and template manager." },
];

function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-28 text-center">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">Features</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto">
              The complete toolkit for global SMS
            </h1>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Designed for marketing, product and engineering teams that need reliable messaging at any scale.
            </p>
          </div>
        </section>
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {items.map((f, i) => (
              <motion.div key={f.title}
                initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <Card className="p-6 h-full hover:border-primary/40 transition-colors">
                  <div className="size-11 rounded-lg bg-primary/10 text-primary grid place-items-center">
                    <f.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
        <section className="py-16">
          <div className="mx-auto max-w-3xl text-center px-4">
            <h2 className="text-3xl font-extrabold">Try it free today</h2>
            <p className="mt-2 text-muted-foreground">50 credits, no card required.</p>
            <Link to="/auth" className="inline-block mt-6">
              <Button size="lg">Start free <ArrowRight className="size-4 ml-1" /></Button>
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
