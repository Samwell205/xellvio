import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Globe2,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  Smartphone,
  Workflow,
} from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { Button } from "@/components/ui/button";
import { faqSchema, pageHead, softwareApplicationSchema, websiteSchema } from "@/lib/seo";

const HOME_TITLE = "Xellvio: SMS Marketing & Customer Messaging Platform";
const HOME_DESCRIPTION =
  "Send SMS campaigns, automate follow-ups, manage replies and measure results across 190+ countries with Xellvio.";

const HOME_FAQS = [
  { q: "What is Xellvio?", a: "Xellvio brings SMS campaigns, automations, a two-way inbox, sign-up forms, landing pages and reporting into one workspace." },
  { q: "How much does Xellvio cost?", a: "Xellvio is pay-as-you-go. You buy credits and see the live price before sending. New accounts start with 50 free credits and no card is required." },
  { q: "Which countries can I send to?", a: "You can reach customers in more than 190 countries. Xellvio guides you through sender and verification requirements for each destination." },
  { q: "Does Xellvio handle consent and opt-outs?", a: "Yes. Consent, opt-out keywords and suppressions are tracked so unsubscribed contacts are excluded from future sends." },
  { q: "Can I automate messages?", a: "Yes. Build flows triggered by sign-ups, replies, keywords and your own events, with waits, branches and conditions." },
  { q: "What can I measure?", a: "Campaign reports show delivery, clicks, replies, spend and results, with recipient exports when you need a closer look." },
];

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      path: "/",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      schema: [
        websiteSchema(),
        softwareApplicationSchema({
          description: HOME_DESCRIPTION,
          featureList: ["Bulk SMS campaigns", "Automated messaging flows", "Two-way inbox", "Audience segments", "Click and reply reporting", "Landing pages and sign-up forms"],
        }),
        faqSchema(HOME_FAQS),
      ],
    }),
  component: HomePage,
});

const stats = [
  ["190+", "Countries reached"],
  ["5,000", "Messages per minute"],
  ["98%", "Average delivery rate"],
  ["24/7", "Delivery monitoring"],
] as const;

function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <MarketingNav />
      <main>
        <Hero />
        <Proof />
        <WorkflowSection />
        <Channels />
        <GlobalDelivery />
        <HowItWorks />
        <FAQ />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-14 sm:px-8 md:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
        <div>
          <span className="inline-flex bg-lime px-2.5 py-1 font-mono text-[11px] font-bold uppercase text-lime-foreground">
            Global customer messaging
          </span>
          <h1 className="mt-6 max-w-3xl text-5xl font-extrabold leading-[0.96] tracking-normal sm:text-6xl lg:text-7xl">
            Every message.
            <span className="block text-muted-foreground">One clear system.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Send campaigns, automate follow-ups, manage replies and see what worked — without stitching five tools together.
          </p>
          <div className="mt-9 grid gap-3 sm:flex">
            <Button asChild size="lg" className="h-13 rounded-none px-6">
              <Link to="/auth" search={{ mode: "signup" } as never}>
                Start free <ArrowRight className="ml-auto size-4 sm:ml-2" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-13 rounded-none px-6">
              <Link to="/contact">Get a demo</Link>
            </Button>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {["50 free credits", "No card required", "Pay as you go"].map((item) => (
              <span key={item} className="flex items-center gap-1.5"><Check className="size-3.5 text-primary" />{item}</span>
            ))}
          </div>
        </div>
        <ProductWorkspace />
      </div>
    </section>
  );
}

function ProductWorkspace() {
  return (
    <div className="overflow-hidden border border-border bg-card shadow-xl shadow-foreground/5">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-3">
        <div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-border" /><span className="size-2 rounded-full bg-border" /><span className="size-2 rounded-full bg-border" /></div>
        <span className="font-mono text-[10px] uppercase text-muted-foreground">Campaign control</span>
      </div>
      <div className="grid min-h-[390px] md:grid-cols-[170px_1fr]">
        <div className="hidden border-r border-border bg-ink p-4 text-ink-foreground md:block">
          <p className="text-xs font-bold">Summer restock</p>
          <nav className="mt-8 space-y-1 text-xs">
            {[["Overview", true], ["Audience", false], ["Messages", false], ["Reports", false]].map(([label, active]) => (
              <div key={String(label)} className={`px-3 py-2 ${active ? "bg-ink-foreground/10 text-ink-foreground" : "text-ink-foreground/55"}`}>{label}</div>
            ))}
          </nav>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="font-mono text-[10px] uppercase text-muted-foreground">Live campaign</p><h2 className="mt-1 text-xl font-bold">Summer restock</h2></div>
            <span className="bg-success/10 px-2 py-1 text-xs font-semibold text-success">Sending</span>
          </div>
          <div className="mt-7 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
            {[["Delivered", "12,418"], ["Clicked", "3,106"], ["Replies", "742"], ["Conversion", "2.6%"]].map(([label, value]) => (
              <div key={label} className="border-b border-r border-border p-3"><p className="text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[10px] uppercase text-muted-foreground">{label}</p></div>
            ))}
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="border border-border p-4">
              <p className="text-xs font-semibold">Delivery activity</p>
              <div className="mt-5 flex h-24 items-end gap-2">
                {[28, 48, 39, 68, 56, 82, 72, 94, 78, 88].map((height, index) => <span key={index} className="flex-1 bg-primary" style={{ height: `${height}%` }} />)}
              </div>
            </div>
            <div className="bg-ink p-4 text-ink-foreground">
              <p className="font-mono text-[10px] uppercase text-ink-foreground/55">Latest reply</p>
              <p className="mt-4 text-sm leading-relaxed">“Yes, send me the link.”</p>
              <div className="mt-5 flex items-center gap-2 text-xs text-lime"><MessageSquare className="size-3.5" />Reply received now</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Proof() {
  return <section aria-label="Operating proof" className="border-b border-border"><div className="mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">{stats.map(([value, label]) => <div key={label} className="border-x border-border p-5 sm:p-7"><p className="text-3xl font-extrabold tabular-nums">{value}</p><p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">{label}</p></div>)}</div></section>;
}

function WorkflowSection() {
  const steps = [
    { icon: Smartphone, label: "Customer action", text: "A signup, click, purchase or reply enters the same profile." },
    { icon: Workflow, label: "Xellvio decides", text: "Your rules segment the contact and choose the next useful action." },
    { icon: Send, label: "Message delivered", text: "Send the follow-up by SMS or email and track the outcome." },
  ];
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <p className="font-mono text-[11px] font-bold uppercase text-primary">The Xellvio loop</p>
        <div className="mt-4 grid gap-8 lg:grid-cols-2"><h2 className="text-4xl font-extrabold leading-none tracking-normal sm:text-5xl">From customer signal to useful action.</h2><p className="max-w-xl text-lg leading-relaxed text-muted-foreground">Keep customer data, conversations and campaign results connected. Your team sees the whole journey instead of isolated sends.</p></div>
        <div className="mt-14 grid border-l border-t border-border md:grid-cols-3">{steps.map((step, index) => <article key={step.label} className="border-b border-r border-border p-7"><div className="flex items-center justify-between"><step.icon className="size-6 text-primary" /><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div><h3 className="mt-10 text-xl font-bold">{step.label}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.text}</p></article>)}</div>
      </div>
    </section>
  );
}

function Channels() {
  return (
    <section className="bg-ink py-20 text-ink-foreground md:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <p className="font-mono text-[11px] font-bold uppercase text-lime">One audience, connected channels</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-extrabold leading-none tracking-normal sm:text-5xl">Campaigns start conversations. Xellvio keeps them moving.</h2>
        <div className="mt-14 grid gap-px bg-ink-foreground/15 md:grid-cols-2">
          <Channel icon={Smartphone} title="SMS marketing" body="Send globally, schedule by time zone, shorten links and manage replies from one inbox." to="/sms-marketing" />
          <Channel icon={Mail} title="Email marketing" body="Run email beside SMS using the same audience, automation and reporting." to="/email-marketing" />
        </div>
      </div>
    </section>
  );
}

function Channel({ icon: Icon, title, body, to }: { icon: typeof Smartphone; title: string; body: string; to: "/sms-marketing" | "/email-marketing" }) {
  return <Link to={to} className="group bg-ink p-7 transition-colors hover:bg-ink-foreground/5 sm:p-10"><Icon className="size-7 text-lime" /><h3 className="mt-12 text-2xl font-bold">{title}</h3><p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-foreground/65">{body}</p><span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold">Explore <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></Link>;
}

function GlobalDelivery() {
  return (
    <section className="border-b border-border py-20 md:py-28"><div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><p className="font-mono text-[11px] font-bold uppercase text-primary">Global delivery</p><h2 className="mt-4 text-4xl font-extrabold leading-none tracking-normal sm:text-5xl">Local requirements, handled in one place.</h2><p className="mt-6 text-lg leading-relaxed text-muted-foreground">Xellvio shows the right sending route for each destination and keeps verification work inside your account.</p><Button asChild variant="outline" className="mt-8 rounded-none"><Link to="/global-delivery">Explore global delivery <ArrowRight className="ml-2 size-4" /></Link></Button></div><div className="divide-y divide-border border-y border-border">{[["United States & Canada", "Toll-free verification", "Guided inside Xellvio"], ["Open sender-ID markets", "No registration", "Choose your sender and send"], ["Registered sender markets", "Carrier registration", "Track review status in your account"]].map(([region, requirement, detail]) => <div key={region} className="grid gap-2 py-6 sm:grid-cols-[1.2fr_0.8fr_1fr] sm:items-center"><p className="font-semibold">{region}</p><p className="text-sm text-primary">{requirement}</p><p className="text-sm text-muted-foreground">{detail}</p></div>)}</div></div></section>
  );
}

function HowItWorks() {
  return <section className="py-20 md:py-28"><div className="mx-auto max-w-[1400px] px-5 sm:px-8"><h2 className="max-w-2xl text-4xl font-extrabold leading-none tracking-normal sm:text-5xl">Start sending without a long setup.</h2><div className="mt-14 grid gap-8 md:grid-cols-3">{[["01", "Import your audience", "Upload a CSV, organize contacts and keep consent attached."], ["02", "Write and review", "Create the campaign, check the price and preview the message."], ["03", "Send and respond", "Follow delivery, clicks and replies as they happen."]].map(([n, title, body]) => <article key={n} className="border-t-2 border-foreground pt-5"><span className="font-mono text-xs text-muted-foreground">{n}</span><h3 className="mt-8 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p></article>)}</div></div></section>;
}

function FAQ() {
  return <section className="border-t border-border py-20 md:py-28"><div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr]"><div><p className="font-mono text-[11px] font-bold uppercase text-primary">Questions</p><h2 className="mt-4 text-4xl font-extrabold leading-none tracking-normal">Clear answers before you send.</h2></div><div className="divide-y divide-border border-y border-border">{HOME_FAQS.map((faq) => <details key={faq.q} className="group py-5"><summary className="flex cursor-pointer list-none items-start justify-between gap-5 font-semibold">{faq.q}<ChevronDown className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="max-w-2xl pt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p></details>)}</div></div></section>;
}

function FinalCta() {
  return <section className="bg-lime py-16 text-lime-foreground md:py-20"><div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between"><div><ShieldCheck className="size-7" /><h2 className="mt-6 max-w-3xl text-4xl font-extrabold leading-none tracking-normal sm:text-5xl">Your next customer conversation starts here.</h2><p className="mt-4 text-sm font-medium opacity-75">50 free credits. No card required.</p></div><Button asChild size="lg" className="h-13 shrink-0 rounded-none bg-ink px-7 text-ink-foreground hover:bg-ink/90"><Link to="/auth" search={{ mode: "signup" } as never}>Start free <ArrowRight className="ml-2 size-4" /></Link></Button></div></section>;
}

void BarChart3;