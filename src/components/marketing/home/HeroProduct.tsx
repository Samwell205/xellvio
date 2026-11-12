import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  Inbox,
  LayoutTemplate,
  Megaphone,
  Users,
  Workflow,
  Link2,
  Smile,
  Check,
} from "lucide-react";

/* Homepage hero: the campaign review screen as it appears in the Xellvio app,
   paired with the text the customer receives. All data is fictional. */

import { DEMO, MESSAGE, SEGMENTS, ESTIMATED_COST, fmtInt, fmtUsd } from "./demo-fixture";

const NAV = [
  { icon: Megaphone, label: "Campaigns", on: true },
  { icon: Workflow, label: "Automations" },
  { icon: Users, label: "Audiences" },
  { icon: Inbox, label: "Inbox" },
  { icon: LayoutTemplate, label: "Forms" },
  { icon: BarChart3, label: "Reports" },
];

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 text-[13px]">
      <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
      <span className="font-semibold text-foreground">{v}</span>
    </div>
  );
}

export function PhonePreview({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-[220px] rounded-[2.2rem] border border-border bg-ink p-2 shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--ink)_70%,transparent)] ${className}`}
      role="img"
      aria-label="Phone showing the text message the customer receives"
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-background">
        <div className="flex items-center justify-between px-5 pt-2.5 text-[10px] font-semibold text-foreground">
          <span>9:41</span>
          <span className="h-4 w-16 rounded-full bg-ink" />
          <span>5G</span>
        </div>
        <div className="flex flex-col items-center border-b border-border pb-2.5 pt-2">
          <span className="grid size-8 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
            BC
          </span>
          <span className="mt-1 text-[11px] font-semibold text-foreground">{DEMO.sender}</span>
          <span className="text-[9px] text-muted-foreground">Example number</span>
        </div>
        <div className="space-y-2 px-3 py-4">
          <p className="text-center text-[9px] text-muted-foreground">Text Message · Today 10:00</p>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-[11.5px] leading-snug text-foreground">
            {MESSAGE}
          </div>
          <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[11.5px] text-primary-foreground">
            {DEMO.reply}
          </div>
        </div>
        <div className="mx-3 mb-4 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          Text Message
        </div>
      </div>
    </div>
  );
}

export function HeroProduct() {
  return (
    <div className="relative">
      {/* restrained brand field behind the product */}
      <div
        aria-hidden
        className="absolute -inset-x-4 -inset-y-6 rounded-[2rem] bg-accent/60 sm:-inset-x-8"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklab, var(--primary) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="relative sm:pr-24">
        <div
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_80px_-40px_color-mix(in_oklab,var(--ink)_45%,transparent)]"
          role="img"
          aria-label="Xellvio campaign review screen for an example campaign, showing audience, sender, message, segments and estimated cost"
        >
          {/* window bar */}
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="ml-3 truncate rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground">
              xellvio.com/app/campaigns/new
            </span>
            <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Example
            </span>
          </div>
          <div className="flex">
            <aside className="hidden w-40 shrink-0 border-r border-border p-3 sm:block">
              <p className="px-2 pb-3 text-[13px] font-extrabold text-foreground">{DEMO.business}</p>
              {NAV.map((n) => (
                <div
                  key={n.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] ${
                    n.on ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  <n.icon className="size-3.5" /> {n.label}
                </div>
              ))}
            </aside>
            <div className="min-w-0 flex-1 p-4 sm:p-5">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ChevronLeft className="size-3" /> Campaigns
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                  Spring menu — VIP early access
                </h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Draft · Review
                </span>
              </div>
              {/* steps */}
              <div className="mt-3 flex gap-1.5 text-[11px] font-semibold">
                {["Details", "Audience", "Message", "Review"].map((s, i) => (
                  <span
                    key={s}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${
                      i === 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i < 3 && <Check className="size-3" />} {s}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-border p-3 sm:mr-28 lg:mr-24">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Message
                  </p>
                  <p className="mt-2 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-foreground">
                    {DEMO.templateLead}<span className="rounded bg-accent px-1 text-accent-foreground">{"{first_name}"}</span>{DEMO.templateTail}
                    <span className="text-primary underline">{DEMO.link}</span>{DEMO.stop}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <Smile className="size-3.5" />
                    <Link2 className="size-3.5" /> Tracked link
                    <span className="ml-auto tabular-nums">{SEGMENTS.charCount} chars · {SEGMENTS.segments} segment{SEGMENTS.segments === 1 ? "" : "s"} · preview for {DEMO.contact.first}</span>
                  </div>
                </div>
                <div className="divide-y divide-border rounded-xl border border-border px-3 sm:mr-28 lg:mr-24">
                  <Row k="Audience" v={`${DEMO.audience.name} · ${fmtInt(DEMO.audience.size)} · ${DEMO.country}`} />
                  <Row k="Sender" v={`${DEMO.sender} (example two-way number)`} />
                  <Row
                    k="Send"
                    v={
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" /> Fri 10:00
                      </span>
                    }
                  />
                  <Row k="Estimated cost" v={`${fmtUsd(ESTIMATED_COST)} example estimate`} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <span className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground">
                  Send a test
                </span>
                <span className="rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">
                  Schedule campaign
                </span>
              </div>
            </div>
          </div>
        </div>
        <PhonePreview className="relative mx-auto -mt-6 sm:absolute sm:-bottom-12 sm:right-0 sm:mt-0" />
      </div>
    </div>
  );
}
