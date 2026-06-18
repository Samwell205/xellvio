import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, BellRing, Code2, MessageSquare, ShieldCheck, ShoppingBag, Users, Workflow } from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/solutions")({
  head: () => ({
    meta: [
      { title: "SMS Solutions — Samwell Global SMS" },
      { name: "description", content: "SMS marketing, transactional messaging, automations, compliance, sender identity, and developer APIs for global teams." },
      { property: "og:title", content: "SMS Solutions — Samwell Global SMS" },
      { property: "og:description", content: "Customer messaging workflows inspired by the best SMS platforms." },
    ],
  }),
  component: SolutionsPage,
});

const solutions = [
  { icon: ShoppingBag, title: "Commerce campaigns", text: "Launch promos, drops, back-in-stock alerts, and winback SMS with contact segments and scheduled sends." },
  { icon: BellRing, title: "Transactional alerts", text: "Send one-time passwords, delivery updates, appointment reminders, and account notifications from verified identities." },
  { icon: Workflow, title: "Lifecycle automation", text: "Build message flows around signup, purchase, inactivity, birthdays, and consent status." },
  { icon: Code2, title: "Developer messaging", text: "Use API keys, webhooks, and delivery logs to connect SMS to your product and internal systems." },
];

const lifecycle = ["Collect consent", "Import or segment contacts", "Approve sender", "Compose SMS", "Schedule or trigger", "Track delivery"];

function SolutionsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <section className="hero-gradient border-b">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 md:py-28 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-center">
            <div>
              <Badge variant="outline" className="bg-background/70">Solutions</Badge>
              <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
                SMS workflows for marketing, alerts, and automation
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-2xl">
                Run SMS like mature platforms do: consent-first audiences, verified sender identities, clear campaign flows, and measurable delivery.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth" search={{ mode: "signup" }}><Button size="lg">Start free <ArrowRight className="size-4" /></Button></Link>
                <Link to="/docs"><Button size="lg" variant="outline">View documentation</Button></Link>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 card-elevated">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <div className="text-sm font-semibold">Abandoned cart recovery</div>
                  <div className="text-xs text-muted-foreground">Lifecycle SMS flow</div>
                </div>
                <Badge>Active</Badge>
              </div>
              <div className="mt-5 space-y-3">
                {lifecycle.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-lg border bg-background p-3">
                    <div className="size-7 rounded-md bg-primary/10 text-primary grid place-items-center text-xs font-bold">{index + 1}</div>
                    <span className="text-sm font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {solutions.map((item, index) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.04 }}>
                <Card className="p-6 h-full">
                  <div className="size-11 rounded-lg bg-primary/10 text-primary grid place-items-center"><item.icon className="size-5" /></div>
                  <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="py-20 border-y bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 grid gap-8 lg:grid-cols-3">
            <div>
              <ShieldCheck className="size-10 text-primary" />
              <h2 className="mt-4 text-3xl font-extrabold">Compliance is part of the send flow</h2>
              <p className="mt-3 text-muted-foreground">Users cannot send until the sender identity is verified or approved, and contacts can be organized around consent and opt-out status.</p>
            </div>
            <Card className="p-6 lg:col-span-2">
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <CheckItem icon={Users} title="Audience consent" text="Import contacts, manage lists, and segment before sending." />
                <CheckItem icon={MessageSquare} title="Verified senders" text="Personal numbers must pass OTP; sender IDs need admin approval." />
                <CheckItem icon={ShieldCheck} title="Delivery controls" text="Campaigns use approved identities and store delivery status." />
              </div>
            </Card>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function CheckItem({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return (
    <div>
      <Icon className="size-5 text-primary" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1.5 text-muted-foreground">{text}</p>
    </div>
  );
}