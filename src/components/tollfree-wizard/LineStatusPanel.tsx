import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, BadgeCheck, CalendarClock, Check, FileCheck2, Hourglass, Phone, RefreshCw, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Line = {
  phone_number?: string | null;
  status: string;
  status_detail?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Adds business days (skips Sat/Sun). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}

function businessDaysBetween(a: Date, b: Date): number {
  let n = 0;
  const d = new Date(a);
  while (d < b) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6 && d <= b) n++;
  }
  return n;
}

const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export function LineStatusPanel({ line, onRefresh, refreshing, onFix }: { line: Line; onRefresh: () => void; refreshing: boolean; onFix?: () => void }) {
  const reduce = useReducedMotion();
  const submitted = line.created_at ? new Date(line.created_at) : new Date();
  const earliest = addBusinessDays(submitted, 3);
  const latest = addBusinessDays(submitted, 5);
  const elapsed = Math.min(5, businessDaysBetween(submitted, new Date()));
  const state = line.status === "active" ? "approved" : line.status === "rejected" ? "rejected" : "review";
  const progress = state === "review" ? Math.max(0.12, elapsed / 5) : 1;

  const steps = [
    { label: "Submitted", sub: fmt(submitted), icon: Send, done: true },
    { label: "Number reserved", sub: line.phone_number ?? "Reserved", icon: Phone, done: true },
    { label: "Carrier review", sub: state === "review" ? `Day ${Math.max(1, elapsed)} of 3–5` : "Completed", icon: Hourglass, done: state !== "review", current: state === "review" },
    {
      label: state === "rejected" ? "Changes needed" : "Approved",
      sub: state === "review" ? `Expected ${fmt(earliest)} – ${fmt(latest)}` : line.updated_at ? fmt(new Date(line.updated_at)) : "",
      icon: state === "rejected" ? XCircle : BadgeCheck,
      done: state !== "review",
      bad: state === "rejected",
    },
  ];

  const tone =
    state === "approved" ? "border-success/40 from-success/10" : state === "rejected" ? "border-destructive/40 from-destructive/10" : "border-primary/30 from-primary/10";

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br to-card ${tone} p-6 sm:p-8`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${state === "approved" ? "bg-success/15 text-success" : state === "rejected" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
            {state === "review" && (
              <span className="relative flex size-2">
                {!reduce && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />}
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            )}
            {state === "approved" ? "Approved" : state === "rejected" ? "Rejected — action needed" : "In carrier review"}
          </span>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {state === "approved" ? "Your toll-free number is live" : state === "rejected" ? "The carrier asked for changes" : "We're waiting on the carrier"}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {state === "approved"
              ? "You can now send to US and Canada from your own dedicated number."
              : state === "rejected"
                ? "Read the reason below, fix those details and resubmit. Your number stays reserved."
                : "Reviews usually take 3–5 business days. Nothing else is needed from you — this page updates on its own and you'll see the result here."}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-background/70 px-4 py-3 backdrop-blur">
          <Phone className="size-5 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">Your number</div>
            <div className="font-mono text-base font-semibold">{line.phone_number ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-8">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className={`h-full rounded-full ${state === "rejected" ? "bg-destructive" : state === "approved" ? "bg-success" : "bg-primary"}`}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          />
        </div>
        <ol className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {steps.map((s, i) => (
            <motion.li
              key={s.label}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              className="flex items-start gap-3"
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${
                  s.bad ? "border-destructive bg-destructive text-destructive-foreground" : s.done ? "border-primary bg-primary text-primary-foreground" : s.current ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {s.done && !s.bad && i < 3 ? <Check className="size-4" /> : <s.icon className={`size-4 ${s.current && !reduce ? "animate-pulse" : ""}`} />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="truncate text-xs text-muted-foreground">{s.sub}</div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>

      {state === "review" && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border bg-background/60 p-3 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0 text-primary" />
          Expected decision between <strong className="text-foreground">{fmt(earliest)}</strong> and <strong className="text-foreground">{fmt(latest)}</strong>.
        </div>
      )}

      {state === "rejected" && (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="size-4" /> Reason from the carrier
          </div>
          <p className="mt-1 text-foreground">{line.status_detail || "The carrier did not give a reason. Please check your business details and resubmit."}</p>
          {onFix && (
            <Button size="sm" className="mt-3" onClick={onFix}>
              <FileCheck2 className="mr-1 size-4" /> Fix details and resubmit
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {state === "approved" && (
          <Button asChild size="sm"><Link to="/app/campaigns/new">Start a campaign</Link></Button>
        )}
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-1 size-4 ${refreshing ? "animate-spin" : ""}`} /> Check status now
        </Button>
        {line.updated_at && <span className="text-xs text-muted-foreground">Last updated {new Date(line.updated_at).toLocaleString()}</span>}
      </div>
    </motion.section>
  );
}
