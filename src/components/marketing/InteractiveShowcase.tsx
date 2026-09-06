import { Link } from "@tanstack/react-router";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  LayoutTemplate,
  Mail,
  MessageSquare,
  MousePointerClick,
  Send,
  Sparkles,
  Split,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/* ============================================================================
   Interactive product showcase — scroll-driven story of one customer moving
   through Xellvio: activity in, intelligence, automation out, ecosystem.
   Motion is transform/opacity only (GPU friendly) and fully disabled under
   prefers-reduced-motion, where every card is simply shown at once.
   ========================================================================== */

const STAGES = [
  { key: "profile", label: "One customer", hint: "A single profile enters Xellvio." },
  { key: "activity", label: "Every action captured", hint: "Visits, forms, clicks, replies." },
  { key: "connect", label: "Data connects", hint: "Activity becomes one live profile." },
  { key: "automation", label: "Automation responds", hint: "Triggers, waits, conditions." },
  { key: "ai", label: "AI reads intent", hint: "Scored, explained, recommended." },
  { key: "channels", label: "Multi-channel action", hint: "SMS, email, audience, CRM." },
  { key: "ecosystem", label: "One connected platform", hint: "The whole picture, working." },
] as const;

/* --------------------------------- shell ---------------------------------- */

function CardShell({
  children,
  className = "",
  tone = "card",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "card" | "ink" | "glass";
}) {
  const tones = {
    card: "bg-card border-border",
    ink: "bg-ink text-ink-foreground border-white/10",
    glass: "bg-card/70 backdrop-blur-xl border-border/70",
  } as const;
  return (
    <div
      className={`rounded-2xl border shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
      <Icon className="size-3.5" strokeWidth={2} /> {children}
    </div>
  );
}

/* --------------------------------- cards ---------------------------------- */

function ProfileCard() {
  return (
    <CardShell className="w-[290px] p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-coral text-base font-extrabold text-coral-foreground">
          AN
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-foreground">Ada Nwosu</p>
            <BadgeCheck className="size-3.5 text-success" />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">ada@brightleaf.co</p>
          <p className="truncate text-[11px] text-muted-foreground">+234 802 ••• 4417</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Subscribed", "VIP", "Lagos"].map((t) => (
          <span
            key={t}
            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/70 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Lifetime value
          </p>
          <p className="text-base font-extrabold tabular-nums text-foreground">$1,840</p>
        </div>
        <div className="rounded-xl bg-muted/70 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Engagement
          </p>
          <p className="text-base font-extrabold tabular-nums text-foreground">82/100</p>
        </div>
      </div>
    </CardShell>
  );
}

const ACTIVITY = [
  { icon: Globe2, label: "Visited pricing page", time: "2m ago" },
  { icon: LayoutTemplate, label: "Submitted signup form", time: "2m ago" },
  { icon: MousePointerClick, label: "Clicked SMS link", time: "1m ago" },
  { icon: Mail, label: "Opened welcome email", time: "50s ago" },
  { icon: Calendar, label: "Booked appointment", time: "now" },
] as const;

function ActivityCard() {
  return (
    <CardShell tone="glass" className="w-[250px] p-4">
      <Eyebrow icon={Activity}>Customer activity</Eyebrow>
      <ul className="mt-3 space-y-2.5">
        {ACTIVITY.map((a) => (
          <li key={a.label} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-muted">
              <a.icon className="size-3.5 text-foreground" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-foreground">
                {a.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{a.time}</span>
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

const FLOW = [
  { kind: "Trigger", label: "Form submitted", icon: Zap },
  { kind: "Wait", label: "5 minutes", icon: Clock },
  { kind: "AI decision", label: "Analyse lead", icon: Bot },
  { kind: "Send SMS", label: "Personalised follow-up", icon: Send },
  { kind: "Condition", label: "Did they reply?", icon: Split },
] as const;

function AutomationCard() {
  return (
    <CardShell className="w-[270px] p-4">
      <Eyebrow icon={Workflow}>Automation</Eyebrow>
      <div className="mt-3 space-y-1.5">
        {FLOW.map((s, i) => (
          <div key={s.kind}>
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/50 px-2.5 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-card">
                <s.icon className="size-3.5 text-foreground" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {s.kind}
                </span>
                <span className="block truncate text-[12px] font-semibold text-foreground">
                  {s.label}
                </span>
              </span>
            </div>
            {i < FLOW.length - 1 && <div className="ml-5 h-2 w-px bg-border" />}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <span className="rounded-lg bg-success/10 px-2 py-1.5 text-[10px] font-bold text-success">
            YES → Sales
          </span>
          <span className="rounded-lg bg-muted px-2 py-1.5 text-[10px] font-bold text-muted-foreground">
            NO → Email
          </span>
        </div>
      </div>
    </CardShell>
  );
}

function AiCard() {
  return (
    <CardShell tone="ink" className="w-[250px] p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
        <Sparkles className="size-3.5" /> AI insight
      </div>
      <p className="mt-3 text-sm font-semibold leading-snug">
        “High purchase intent — she booked within minutes of clicking.”
      </p>
      <p className="mt-3 text-[11px] uppercase tracking-wide opacity-60">Recommended action</p>
      <p className="text-[12px] font-semibold">Send a personalised follow-up now</p>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide opacity-60">
          <span>Confidence</span>
          <span className="tabular-nums">94%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-[94%] rounded-full bg-lime" />
        </div>
      </div>
    </CardShell>
  );
}

function CampaignCard() {
  const rows = [
    { label: "Delivered", value: "12,418", pct: 98 },
    { label: "Clicked", value: "3,106", pct: 25 },
    { label: "Replied", value: "742", pct: 6 },
    { label: "Converted", value: "318", pct: 3 },
  ];
  return (
    <CardShell className="w-[240px] p-4">
      <Eyebrow icon={MessageSquare}>SMS campaign</Eyebrow>
      <p className="mt-2 text-sm font-bold text-foreground">Autumn restock</p>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-bold tabular-nums text-foreground">{r.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-coral" style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function LandingCard() {
  return (
    <CardShell className="w-[220px] overflow-hidden p-0">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
        <span className="size-2 rounded-full bg-coral/70" />
        <span className="size-2 rounded-full bg-lime/80" />
        <span className="size-2 rounded-full bg-border" />
        <span className="ml-1 truncate text-[10px] text-muted-foreground">
          brightleaf.xellvio.site
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="h-2.5 w-4/5 rounded-full bg-foreground/80" />
        <div className="h-2 w-full rounded-full bg-muted" />
        <div className="h-2 w-3/5 rounded-full bg-muted" />
        <div className="mt-2 h-7 w-24 rounded-lg bg-coral" />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="h-9 rounded-lg bg-muted" />
          <div className="h-9 rounded-lg bg-muted" />
          <div className="h-9 rounded-lg bg-muted" />
        </div>
      </div>
    </CardShell>
  );
}

function FormCard() {
  return (
    <CardShell tone="glass" className="w-[210px] p-4">
      <Eyebrow icon={LayoutTemplate}>Signup form</Eyebrow>
      <p className="mt-2 text-[12px] font-bold text-foreground">Get 10% off by text</p>
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
          Ada Nwosu
        </div>
        <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
          +234 802 ••• 4417
        </div>
        <div className="flex items-start gap-1.5 text-[9px] leading-snug text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" />
          Consent captured with opt-out wording
        </div>
        <div className="rounded-lg bg-foreground py-2 text-center text-[11px] font-bold text-background">
          Join
        </div>
      </div>
    </CardShell>
  );
}

const CHANNEL_OUT = [
  { icon: Send, label: "SMS sent", tone: "text-coral" },
  { icon: Mail, label: "Email queued", tone: "text-foreground" },
  { icon: Users, label: "Audience updated", tone: "text-foreground" },
  { icon: Workflow, label: "CRM synced", tone: "text-foreground" },
] as const;

function ChannelsCard() {
  return (
    <CardShell className="w-[230px] p-4">
      <Eyebrow icon={Zap}>Actions taken</Eyebrow>
      <ul className="mt-3 space-y-2">
        {CHANNEL_OUT.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <c.icon className={`size-3.5 ${c.tone}`} strokeWidth={1.8} /> {c.label}
            </span>
            <CheckCircle2 className="size-3.5 text-success" />
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

/* ------------------------- desktop cinematic canvas ------------------------ */

type Placed = {
  id: string;
  node: React.ReactNode;
  /** stage index the card appears at */
  from: number;
  /** css position on the canvas */
  style: React.CSSProperties;
  /** parallax depth: 1 = foreground (fast), 0.3 = background (slow) */
  depth: number;
};

const PLACEMENT: Placed[] = [
  {
    id: "profile",
    node: <ProfileCard />,
    from: 0,
    style: { left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 30 },
    depth: 1,
  },
  {
    id: "activity",
    node: <ActivityCard />,
    from: 1,
    style: { left: "3%", top: "7%", zIndex: 20 },
    depth: 0.75,
  },
  {
    id: "form",
    node: <FormCard />,
    from: 1,
    style: { right: "4%", top: "5%", zIndex: 18 },
    depth: 0.6,
  },
  {
    id: "landing",
    node: <LandingCard />,
    from: 1,
    style: { left: "5%", bottom: "8%", zIndex: 16 },
    depth: 0.45,
  },
  {
    id: "automation",
    node: <AutomationCard />,
    from: 3,
    style: { right: "3%", top: "30%", zIndex: 25 },
    depth: 0.85,
  },
  {
    id: "ai",
    node: <AiCard />,
    from: 4,
    style: { left: "1%", top: "54%", zIndex: 28 },
    depth: 0.95,
  },
  {
    id: "channels",
    node: <ChannelsCard />,
    from: 5,
    style: { right: "13%", bottom: "7%", zIndex: 22 },
    depth: 0.7,
  },
  {
    id: "campaign",
    node: <CampaignCard />,
    from: 5,
    style: { left: "33%", bottom: "6%", zIndex: 24 },
    depth: 0.55,
  },
];

function ConnectionLines({ active }: { active: boolean }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {[
        "M14,20 C34,26 40,40 49,48",
        "M86,16 C70,26 60,36 51,47",
        "M18,88 C32,72 42,58 49,52",
        "M88,42 C74,44 60,48 52,49",
        "M10,54 C26,52 40,50 48,50",
        "M84,92 C70,78 58,62 51,52",
      ].map((d, i) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="color-mix(in oklab, var(--coral) 55%, transparent)"
          strokeWidth={0.25}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
          transition={{ duration: 0.9, delay: active ? i * 0.08 : 0, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}

function Card3D({
  placed,
  stage,
  mx,
  my,
  progress,
}: {
  placed: Placed;
  stage: number;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  progress: MotionValue<number>;
}) {
  const visible = stage >= placed.from;
  const px = useTransform(mx, (v) => v * 26 * placed.depth);
  const py = useTransform(my, (v) => v * 18 * placed.depth);
  const drift = useTransform(progress, [0, 1], [24 * placed.depth, -24 * placed.depth]);
  const rotY = useTransform(mx, (v) => v * 6 * placed.depth);
  const rotX = useTransform(my, (v) => -v * 5 * placed.depth);

  return (
    <motion.div
      className="absolute will-change-transform"
      style={{ ...placed.style, transformStyle: "preserve-3d" }}
    >
      <motion.div style={{ x: px, y: py }}>
        <motion.div style={{ y: drift, rotateY: rotY, rotateX: rotX }}>
          <motion.div
            initial={false}
            animate={
              visible
                ? { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }
                : { opacity: 0, scale: 0.94, y: 26, filter: "blur(6px)" }
            }
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {placed.node}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function DesktopCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const [stage, setStage] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(STAGES.length - 1, Math.max(0, Math.floor(v * STAGES.length)));
    setStage((s) => (s === next ? s : next));
  });

  const mxRaw = useSpring(0, { stiffness: 90, damping: 20, mass: 0.4 });
  const myRaw = useSpring(0, { stiffness: 90, damping: 20, mass: 0.4 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mxRaw.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    myRaw.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  }

  const glow = useTransform(scrollYProgress, [0, 1], [0.35, 0.8]);

  return (
    <div ref={wrapRef} className="relative hidden lg:block" style={{ height: "560vh" }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1400px] grid-cols-[minmax(280px,340px)_1fr] items-center gap-10 px-5 sm:px-8">
          {/* narrative rail */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-coral">
              The Xellvio loop
            </p>
            <h2 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground">
              Every customer action.
              <br />
              One intelligent platform.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Xellvio connects every interaction across your business and turns customer behaviour
              into personalised action — automatically.
            </p>
            <ol className="mt-7 space-y-1">
              {STAGES.map((s, i) => {
                const on = i === stage;
                const done = i < stage;
                return (
                  <li key={s.key}>
                    <div
                      className={`flex items-start gap-3 rounded-xl px-3 py-2 transition-colors duration-300 ${
                        on ? "bg-muted" : "bg-transparent"
                      }`}
                    >
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full transition-colors duration-300 ${
                          on ? "bg-coral" : done ? "bg-foreground/40" : "bg-border"
                        }`}
                      />
                      <span>
                        <span
                          className={`block text-sm font-bold transition-colors duration-300 ${
                            on ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {s.label}
                        </span>
                        {on && (
                          <motion.span
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="block text-[11px] text-muted-foreground"
                          >
                            {s.hint}
                          </motion.span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/auth">
                  Explore Xellvio <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link to="/features">See how it works</Link>
              </Button>
            </div>
          </div>

          {/* canvas */}
          <div
            onMouseMove={onMove}
            onMouseLeave={() => {
              mxRaw.set(0);
              myRaw.set(0);
            }}
            className="relative h-[80vh] overflow-hidden rounded-[36px] border border-border bg-muted/40"
            style={{ perspective: "1400px" }}
          >
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-[36px]"
              style={{
                opacity: glow,
                backgroundImage:
                  "radial-gradient(circle at 30% 25%, color-mix(in oklab, var(--coral) 16%, transparent) 0, transparent 52%), radial-gradient(circle at 75% 75%, color-mix(in oklab, var(--primary) 16%, transparent) 0, transparent 52%)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-[36px] opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                maskImage: "radial-gradient(circle at 50% 50%, black, transparent 78%)",
              }}
            />
            <ConnectionLines active={stage >= 2} />
            <div className="absolute inset-0 scale-[0.86] 2xl:scale-95">
              {PLACEMENT.map((p) => (
                <Card3D
                  key={p.id}
                  placed={p}
                  stage={stage}
                  mx={mxRaw}
                  my={myRaw}
                  progress={scrollYProgress}
                />
              ))}
            </div>
            <motion.div
              initial={false}
              animate={{ opacity: stage >= 6 ? 1 : 0, y: stage >= 6 ? 0 : 8 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-0 top-5 mx-auto w-fit rounded-full border border-border bg-card/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground backdrop-blur"
            >
              Understood · decided · actioned
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- mobile / tablet flow -------------------------- */

const MOBILE_STEPS: { title: string; body: string; node: React.ReactNode }[] = [
  {
    title: "One customer",
    body: "Every profile holds the contact details, tags, value and engagement in one place.",
    node: <ProfileCard />,
  },
  {
    title: "Every action captured",
    body: "Page visits, form submissions, link clicks, replies and bookings all land on the profile.",
    node: <ActivityCard />,
  },
  {
    title: "AI reads the intent",
    body: "Xellvio scores behaviour and suggests the next action — you stay in control.",
    node: <AiCard />,
  },
  {
    title: "Automation responds",
    body: "Triggers, waits and conditions send the right follow-up within minutes.",
    node: <AutomationCard />,
  },
  {
    title: "Multi-channel action",
    body: "Texts go out, email is queued, audiences and your CRM update themselves.",
    node: <ChannelsCard />,
  },
  {
    title: "Results you can see",
    body: "Delivery, clicks, replies and conversions reported per campaign.",
    node: <CampaignCard />,
  },
];

function MobileFlow({ reduced }: { reduced: boolean }) {
  return (
    <div className="lg:hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-coral">
          The Xellvio loop
        </p>
        <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-foreground">
          Every customer action. One intelligent platform.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Xellvio connects every interaction across your business and turns customer behaviour into
          personalised action — automatically.
        </p>
        <div className="mt-8 space-y-5">
          {MOBILE_STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={reduced ? false : { opacity: 0, y: 20 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[26px] border border-border bg-muted/40 p-5"
            >
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <span className="grid size-5 place-items-center rounded-full bg-coral text-[10px] text-coral-foreground">
                  {i + 1}
                </span>
                Step {i + 1}
              </div>
              <h3 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <div className="mt-4 flex justify-center [&>*]:w-full [&>*]:max-w-[320px]">
                {s.node}
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link to="/auth">
              Explore Xellvio <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full">
            <Link to="/features">See how it works</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- static / reduced motion ----------------------- */

function StaticCanvas() {
  return (
    <div className="mx-auto hidden max-w-[1400px] px-5 sm:px-8 lg:block">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-coral">
        The Xellvio loop
      </p>
      <h2 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground">
        Every customer action. One intelligent platform.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Xellvio connects every interaction across your business and turns customer behaviour into
        personalised action — automatically.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-6 xl:grid-cols-4">
        {[
          <ProfileCard key="p" />,
          <ActivityCard key="a" />,
          <AiCard key="i" />,
          <AutomationCard key="w" />,
          <ChannelsCard key="c" />,
          <CampaignCard key="m" />,
          <LandingCard key="l" />,
          <FormCard key="f" />,
        ].map((n, i) => (
          <div key={i} className="flex justify-center [&>*]:w-full">
            {n}
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild size="lg" className="rounded-full">
          <Link to="/auth">
            Explore Xellvio <ArrowRight className="ml-1.5 size-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-full">
          <Link to="/features">See how it works</Link>
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- integration rows --------------------------- */

/** Names of apps that exist in the Xellvio app directory today. */
const ROW_A = [
  "Shopify",
  "WooCommerce",
  "Stripe",
  "Paystack",
  "Flutterwave",
  "HubSpot",
  "Salesforce",
  "Pipedrive",
  "Zoho CRM",
  "Klaviyo",
  "Mailchimp",
] as const;

const ROW_B = [
  "OpenAI",
  "Claude",
  "Gemini",
  "Zapier",
  "Make",
  "n8n",
  "Slack",
  "Google Sheets",
  "Google Analytics",
  "Meta Pixel",
  "Calendly",
  "Typeform",
  "Webhooks & API",
] as const;

function LogoRow({ items, reverse }: { items: readonly string[]; reverse?: boolean }) {
  const row = [...items, ...items];
  return (
    <div className="group relative overflow-hidden py-2">
      <div
        className={`marquee-track ${reverse ? "marquee-track--reverse marquee-track--slow" : ""} group-hover:[animation-play-state:paused]`}
      >
        {row.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="mx-2 flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 shadow-sm"
          >
            <span className="grid size-6 place-items-center rounded-lg bg-muted text-[11px] font-extrabold text-foreground">
              {name.charAt(0)}
            </span>
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-foreground">
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationMarquee() {
  return (
    <div className="mt-24 border-t border-border pt-16 lg:mt-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <h2 className="max-w-xl text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Connect your entire growth stack.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Bring your customer data, marketing tools and workflows together with Xellvio. Every name
          below is available in the Xellvio app directory — some connect directly, others through
          Zapier, Make, n8n or our webhooks and API.
        </p>
      </div>
      <div
        className="relative mt-10 space-y-3"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <LogoRow items={ROW_A} />
        <LogoRow items={ROW_B} reverse />
      </div>
    </div>
  );
}

/* --------------------------------- section -------------------------------- */

export function InteractiveShowcase() {
  const reduced = useReducedMotion();

  return (
    <section id="platform-story" className="scroll-mt-32 bg-background py-20 lg:py-4">
      {reduced ? <StaticCanvas /> : <DesktopCanvas />}
      <MobileFlow reduced={Boolean(reduced)} />
      <IntegrationMarquee />
    </section>
  );
}
