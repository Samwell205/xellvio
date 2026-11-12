import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Split,
  UserPlus,
  Zap,
  MousePointerClick,
  Send,
  XCircle,
  Wallet,
  Plus,
  Minus,
  Tag,
} from "lucide-react";
import { DEMO, STATS, ESTIMATED_COST, WELCOME_TEXT, fmtInt, fmtUsd } from "./demo-fixture";

/* Compact three-step homepage showcase. Each visual mirrors a real Xellvio
   screen (form builder output, automation builder, campaign report) using
   fictional data. No production data, no live calls. */

function Frame({ url, label, children }: { url: string; label: string; children: React.ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_70px_-40px_color-mix(in_oklab,var(--ink)_45%,transparent)]"
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 truncate rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground">{url}</span>
        <span className="ml-auto shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Example
        </span>
      </div>
      {children}
    </div>
  );
}

/* ---------------- step 1: form ---------------- */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-foreground">{label}</span>
      <span className="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground">{value}</span>
    </label>
  );
}

function FormVisual() {
  return (
    <Frame url="brightleafcafe.com/join" label="Example sign-up form built with Xellvio on a café website, with name, phone, email and SMS consent, and the new contact it creates">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="bg-accent/50 p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-foreground">Brightleaf Café</p>
          <p className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-foreground">Get first pick of every new menu.</p>
          <p className="mt-2 text-[13px] text-muted-foreground">Join the VIP list for early access and one text a week, at most.</p>
          <div className="mt-5 space-y-3 rounded-xl border border-border bg-card p-4">
            <Field label="First name" value={DEMO.contact.first} />
            <Field label="Mobile number" value={DEMO.contact.phone} />
            <Field label="Email" value={DEMO.contact.email} />
            <div className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded bg-primary text-primary-foreground">
                <CheckCircle2 className="size-3" />
              </span>
              Yes, text me offers from Brightleaf Café. Up to 4 msgs/month. Reply STOP to opt out.
            </div>
            <span className="block rounded-full bg-primary py-2 text-center text-[13px] font-semibold text-primary-foreground">Join the VIP list</span>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In Xellvio · Audiences</p>
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground">AD</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Ada</p>
                <p className="truncate text-[11px] text-muted-foreground">{DEMO.contact.phone} · {DEMO.contact.email}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[12px]">
              <p className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-3.5 text-success" /> SMS consent · form “VIP list”</p>
              <p className="flex items-center gap-2 text-muted-foreground"><Mail className="size-3.5" /> No email consent · receives texts only</p>
              <p className="flex items-center gap-2 text-foreground"><UserPlus className="size-3.5 text-primary" /> Added to list “Website sign-ups”</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Consent is stored with the exact wording and time it was given.</p>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------- step 2: automation canvas ---------------- */
function Node({ kind, icon: Icon, title, desc, tone }: { kind: string; icon: typeof Zap; title: string; desc: string; tone: string }) {
  return (
    <div className="relative w-full max-w-[250px] rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-3">
        <span className={`flex size-6 items-center justify-center rounded-md ${tone}`}><Icon className="size-3.5" /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{kind}</span>
      </div>
      <div className="px-3 pb-3 pt-1.5">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
const Line = ({ h = "h-6" }: { h?: string }) => <span aria-hidden className={`mx-auto block w-px ${h} bg-primary/60`} />;

function AutomationVisual() {
  return (
    <Frame url="xellvio.com/app/automations/welcome-series" label="Example Xellvio automation: when someone joins a list, wait 5 minutes, send a welcome text, with a tracked link, then check whether they clicked: tag clickers, and end the flow for everyone else">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-bold text-foreground">Welcome series</p>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-muted-foreground sm:flex"><Minus className="size-3" /><span className="text-[10px]">100%</span><Plus className="size-3" /></span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">Live</span>
        </div>
      </div>
      <div
        className="px-4 py-6 sm:py-8"
        style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      >
        <div className="mx-auto flex max-w-[560px] flex-col items-center">
          <Node kind="Trigger" icon={Zap} tone="bg-primary/15 text-primary" title="Joins a list" desc="Website sign-ups" />
          <Line />
          <Node kind="Wait" icon={Clock} tone="bg-muted text-muted-foreground" title="Wait" desc="5 minutes" />
          <Line />
          <Node kind="Send SMS" icon={MessageSquare} tone="bg-accent text-accent-foreground" title="Welcome text" desc={WELCOME_TEXT} />
          <Line />
          <Node kind="Condition" icon={Split} tone="bg-muted text-foreground" title="Clicked a link?" desc={`${DEMO.welcomeLink} · within 2 days`} />
          {/* branch */}
          <div className="relative w-full max-w-[520px]">
            <span aria-hidden className="absolute left-1/4 right-1/4 top-0 h-px bg-primary/60" />
            <div className="grid grid-cols-2 gap-3 pt-0">
              {[
                { label: "Yes", node: <Node kind="Add tag" icon={Tag} tone="bg-primary/15 text-primary" title="Tag “Engaged”" desc="Use the tag to target later campaigns" /> },
                { label: "No", node: <Node kind="Exit" icon={CheckCircle2} tone="bg-muted text-muted-foreground" title="End flow" desc="No extra message sent" /> },
              ].map((b) => (
                <div key={b.label} className="flex flex-col items-center">
                  <Line h="h-4" />
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{b.label}</span>
                  <Line h="h-3" />
                  {b.node}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------- step 3: report ---------------- */
/* Mirrors the real report's "Engagement over time" card: sent, delivered and
   clicked, cumulative by hour (see campaign report page). Shares are of each total. */
const CUMULATIVE = [0, 0.62, 0.9, 0.97, 0.99, 1, 1, 1];
const CLICK_CURVE = [0, 0.38, 0.64, 0.79, 0.88, 0.94, 0.98, 1];
function EngagementChart() {
  const W = 320, H = 120;
  const max = STATS.sent;
  const line = (vals: number[]) => vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * (H - 8)}`).join(" ");
  const series = [
    { k: "Sent", cls: "stroke-muted-foreground", v: CUMULATIVE.map((c) => c * STATS.sent) },
    { k: "Delivered", cls: "stroke-primary", v: CUMULATIVE.map((c) => c * DEMO.results.delivered) },
    { k: "Clicked", cls: "stroke-foreground", v: CLICK_CURVE.map((c) => c * DEMO.results.clicks) },
  ];
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-[12px] font-semibold text-foreground">Engagement over time</p>
      <p className="text-[11px] text-muted-foreground">Sent, delivered and clicked, cumulative by hour</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-28 w-full" preserveAspectRatio="none" aria-hidden>
        {series.map((x) => <polyline key={x.k} points={line(x.v)} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className={x.cls} />)}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {series.map((x) => <span key={x.k} className="flex items-center gap-1"><svg width="10" height="2" aria-hidden><line x1="0" y1="1" x2="10" y2="1" strokeWidth={2} className={x.cls} /></svg>{x.k}</span>)}
      </div>
    </div>
  );
}

function ReportVisual() {
  const kpis = [
    { icon: Send, k: "Sent", v: fmtInt(STATS.sent) },
    { icon: CheckCircle2, k: "Delivered", v: fmtInt(DEMO.results.delivered), s: STATS.deliveredPct },
    { icon: MousePointerClick, k: "Link clicks", v: fmtInt(DEMO.results.clicks), s: `${STATS.clickPct} of delivered` },
    { icon: XCircle, k: "Failed", v: fmtInt(DEMO.results.failed), s: STATS.failedPct },
    { icon: Wallet, k: "Spend", v: fmtUsd(ESTIMATED_COST), s: "example" },
  ];
  return (
    <Frame url="xellvio.com/app/campaigns/spring-menu/report" label="Example Xellvio campaign report with sent, delivered, clicks, failed and spend, a cumulative engagement-over-time chart and a delivery status breakdown">
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-extrabold tracking-tight text-foreground">Spring menu — VIP early access</p>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">Sending complete</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{fmtInt(DEMO.results.awaiting)} receipts pending</span>
          <span className="ml-auto text-[11px] text-muted-foreground">Sent Fri 10:00 · {DEMO.sender} · {DEMO.country}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {kpis.map((x) => (
            <div key={x.k} className="rounded-xl border border-border p-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><x.icon className="size-3.5" /> {x.k}</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-foreground">{x.v}</p>
              {x.s && <p className="text-[11px] tabular-nums text-muted-foreground">{x.s}</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <EngagementChart />
          <div className="rounded-xl border border-border p-4">
            <p className="text-[12px] font-semibold text-foreground">Delivery status</p>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="bg-primary" style={{ width: STATS.deliveredPct }} />
              <span className="bg-muted-foreground/40" style={{ width: STATS.awaitingPct }} />
              <span className="bg-destructive" style={{ width: STATS.failedPct }} />
            </div>
            <ul className="mt-3 space-y-1.5 text-[12px]">
              <li className="flex justify-between"><span className="text-muted-foreground">Delivered</span><span className="font-semibold tabular-nums text-foreground">{fmtInt(DEMO.results.delivered)}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Awaiting carrier report</span><span className="font-semibold tabular-nums text-foreground">{fmtInt(DEMO.results.awaiting)}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Failed</span><span className="font-semibold tabular-nums text-foreground">{fmtInt(DEMO.results.failed)}</span></li>
            </ul>
          </div>
        </div>
      </div>
    </Frame>
  );
}

const STEPS = [
  {
    id: "capture",
    tab: "Capture a contact",
    title: "A visitor signs up. A contact appears.",
    body: "Publish a Xellvio form on your site or a landing page. Each submission becomes a contact, added to the list you choose, with SMS and email consent recorded separately.",
    to: "/signup-forms",
    cta: "See forms",
    Visual: FormVisual,
  },
  {
    id: "follow-up",
    tab: "Send the right follow-up",
    title: "The next message sends itself.",
    body: "Automations start from a trigger, wait, check a condition, then send a text or tag the contact. Each step on the canvas shows what happens and when.",
    to: "/automations",
    cta: "See automations",
    Visual: AutomationVisual,
  },
  {
    id: "result",
    tab: "Understand the result",
    title: "See what happened, message by message.",
    body: "Every campaign reports what was sent, delivered, clicked and failed, along with what it cost. Numbers come from carrier reports and tracked links.",
    to: "/reporting",
    cta: "See reporting",
    Visual: ReportVisual,
  },
] as const;

export function ProductSteps() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % STEPS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + STEPS.length) % STEPS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = STEPS.length - 1;
    else return;
    e.preventDefault();
    setActive(n);
    tabs.current[n]?.focus();
  }

  return (
    <section id="platform-story" className="scroll-mt-32 bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          From first sign-up to a result you can read.
        </h2>

        <div role="tablist" aria-label="Xellvio in three steps" className="mt-8 grid gap-2 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.id}
                ref={(el) => { tabs.current[i] = el; }}
                role="tab"
                id={`step-tab-${s.id}`}
                aria-selected={on}
                aria-controls={`step-panel-${s.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  on ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  {i + 1}
                </span>
                <span className="text-sm font-bold">{s.tab}</span>
              </button>
            );
          })}
        </div>

        {/* All panels share one grid cell so the section height never jumps. */}
        <div className="mt-8 grid">
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <div
                key={s.id}
                role="tabpanel"
                id={`step-panel-${s.id}`}
                aria-labelledby={`step-tab-${s.id}`}
                aria-hidden={!on}
                inert={!on ? true : undefined}
                className={`[grid-area:1/1] grid content-start items-start gap-8 lg:content-center lg:items-center transition-opacity duration-300 motion-reduce:transition-none lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-12 ${
                  on ? "opacity-100" : "pointer-events-none invisible opacity-0"
                }`}
              >
                <div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-foreground">{s.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                  <Link to={s.to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:gap-2.5 transition-all">
                    {s.cta} <ArrowRight className="size-4" />
                  </Link>
                </div>
                <div className="min-w-0"><s.Visual /></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
