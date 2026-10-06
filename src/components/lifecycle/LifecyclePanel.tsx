import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Circle,
  PartyPopper,
  Sparkles,
  ArrowRight,
  Zap,
  BarChart3,
  Wallet,
} from "lucide-react";
import { getLifecycle } from "@/lib/lifecycle.functions";

/**
 * The workspace-facing onboarding surface, laid out as an animated bento grid:
 * welcome + checklist hero, the first-send celebration, lifecycle messages and
 * contextual next steps. Every value comes from the workspace's own activity.
 */
export function LifecyclePanel() {
  const load = useServerFn(getLifecycle);

  const state = useQuery({ queryKey: ["lifecycle"], queryFn: () => load(), staleTime: 30_000 });

  const s = state.data;
  const remaining = useMemo(() => (s ? s.total - s.completed : 0), [s]);
  if (!s) return null;

  const done = s.completed >= s.total;
  const showHero = s.show_welcome || (!done && !s.checklist_hidden);
  let i = 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-dash">
      {s.celebrate_first_send && (
        <div
          style={{ "--i": i++ } as React.CSSProperties}
          className="bento-tile col-span-2 lg:col-span-4 bg-arctic-electric text-arctic-ink-fg p-6 bento-sheen"
        >
          <div className="bento-orb -top-10 -right-10 size-40 bg-arctic-ice/40" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="size-12 rounded-2xl bg-arctic-ink-fg/15 grid place-items-center">
              <PartyPopper className="size-6 text-arctic-ice" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-70 font-bold">Milestone</p>
              <h2 className="font-display text-2xl font-bold">Your first campaign is on its way</h2>
              <p className="text-sm opacity-80 mt-1">
                That's the hardest step done. Watch delivery in real time.
              </p>
            </div>
            <div className="flex gap-2">
              <Link to="/app/campaigns">
                <button className="px-5 py-2.5 rounded-xl bg-arctic-ice text-arctic-ink font-bold text-sm active:scale-95 transition-transform">
                  See the report
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {showHero && (
        <div
          style={{ "--i": i++ } as React.CSSProperties}
          className="bento-tile col-span-2 lg:col-span-4 bg-arctic-tile border border-arctic-line p-6 lg:p-8"
        >
          <div className="bento-orb -top-16 -right-16 size-56 bg-arctic-ice/30" />
          <div className="bento-orb -bottom-20 left-1/3 size-48 bg-arctic-electric/10 [animation-delay:-4s]" />
          <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-6">
            <div>
              <div className="flex items-center gap-2 text-arctic-electric">
                <Sparkles className="size-4" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold">
                  {s.stage_label}
                </span>
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight mt-2">
                Welcome to Xellvio
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-md">
                {done
                  ? "You're all set up. Time to grow."
                  : `${remaining} step${remaining === 1 ? "" : "s"} until your first SMS campaign is live. We'll keep track as you go.`}
              </p>
              <div className="mt-6 h-2 w-full rounded-full bg-arctic-bg overflow-hidden">
                <div
                  className="bento-fill h-full rounded-full bg-gradient-to-r from-arctic-electric to-arctic-ice shadow-[0_0_12px_var(--arctic-electric)]"
                  style={{ width: `${s.progress}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-arctic-electric font-display">
                  {s.completed}/{s.total} COMPLETED
                </span>
                {s.next && (
                  <Link
                    to={s.next.href as never}
                    className="text-sm font-bold underline underline-offset-4 decoration-arctic-electric"
                  >
                    {s.next.label}
                  </Link>
                )}
              </div>
            </div>
            {!done && (
              <ul className="space-y-1.5">
                {s.checklist.map((item, idx) => (
                  <li
                    key={item.key}
                    className="bento-tile !rounded-xl hover:!translate-y-0 hover:!shadow-none"
                    style={{ "--i": idx + 2 } as React.CSSProperties}
                  >
                    <Link
                      to={item.href as never}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-arctic-bg ${
                        item.done ? "text-muted-foreground" : "font-medium"
                      }`}
                    >
                      {item.done ? (
                        <CheckCircle2 className="size-4 text-arctic-electric shrink-0" />
                      ) : (
                        <Circle className="size-4 text-arctic-line shrink-0" />
                      )}
                      <span className={item.done ? "line-through" : ""}>{item.label}</span>
                      {!item.done && (
                        <ArrowRight className="size-3.5 ml-auto text-muted-foreground transition-transform group-hover:translate-x-1" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {s.messages.map((m) => {
        const low = /balance|top up/i.test(`${m.title} ${m.cta_label ?? ""}`);
        const report = /report|congrat/i.test(`${m.title} ${m.cta_label ?? ""}`);
        const Icon = low ? Wallet : report ? BarChart3 : Zap;
        const dark = low;
        return (
          <div
            key={m.id}
            style={{ "--i": i++ } as React.CSSProperties}
            className={`bento-tile col-span-2 p-6 flex flex-col ${
              dark
                ? "bg-arctic-feature text-arctic-ink-fg border border-arctic-line"
                : "bg-arctic-tile border border-arctic-line"
            }`}
          >
            {dark && <div className="bento-orb -bottom-10 -right-6 size-32 bg-arctic-electric/40" />}
            <div className="relative flex items-start justify-between mb-4">
              <div
                className={`p-3 rounded-xl ${dark ? "bg-arctic-ink-fg/10" : "bg-arctic-bg"}`}
              >
                <Icon className={`size-5 ${dark ? "text-arctic-ice" : "text-arctic-electric"}`} />
              </div>
            </div>
            <h3 className="relative font-display text-lg font-bold">{m.title}</h3>
            {m.body && (
              <p
                className={`relative text-sm mt-1 whitespace-pre-line flex-1 ${dark ? "opacity-70" : "text-muted-foreground"}`}
              >
                {m.body}
              </p>
            )}
            {m.cta_path && m.cta_label && (
              <Link to={m.cta_path as never} className="relative mt-4">
                <button
                  className={`w-full py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform ${
                    dark
                      ? "bg-arctic-electric text-arctic-ink-fg"
                      : "bg-arctic-bg border border-arctic-line hover:border-arctic-electric"
                  }`}
                >
                  {m.cta_label}
                </button>
              </Link>
            )}
          </div>
        );
      })}

      {s.recommendations.map((r, idx) => {
        const electric = idx % 2 === 0;
        return (
          <Link
            key={r.key}
            to={r.href as never}
            style={{ "--i": i++ } as React.CSSProperties}
            className={`bento-tile group col-span-1 aspect-square p-5 flex flex-col justify-between ${
              electric
                ? "bg-arctic-electric text-arctic-ink-fg"
                : "bg-arctic-bg border-2 border-dashed border-arctic-line"
            }`}
          >
            <div
              className={`size-10 rounded-full grid place-items-center ${electric ? "bg-arctic-ink-fg/20" : "bg-arctic-tile"}`}
            >
              <Zap className={`size-5 ${electric ? "text-arctic-ice" : "text-arctic-electric"}`} />
            </div>
            <div>
              <p
                className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${electric ? "opacity-60" : "text-muted-foreground"}`}
              >
                {r.cta}
              </p>
              <p className="font-display text-sm font-bold leading-tight">{r.title}</p>
              <ArrowRight className="size-4 mt-2 transition-transform group-hover:translate-x-1.5" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
