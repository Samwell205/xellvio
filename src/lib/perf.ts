/**
 * Real user performance measurement.
 *
 * Uses the browser's own Performance APIs — no synthetic or invented numbers —
 * and reports through the existing privacy-conscious event pipeline (random
 * visit id, path and coarse labels only). Everything is wrapped so measurement
 * can never affect the page.
 */
import { track } from "@/lib/growth/track";

type Nav = { path: string; start: number };

let pending: Nav | null = null;
let started = false;

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function report(name: "LCP" | "CLS" | "INP" | "TTFB", value: number, path: string) {
  track({
    event: "web_vital",
    path,
    props: { metric: name, value: round(value) },
  });
}

/** Observes Core Web Vitals for the current document. Safe to call once. */
export function initWebVitals() {
  if (started || typeof window === "undefined") return;
  started = true;
  const path = window.location.pathname;

  try {
    const navEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navEntry) report("TTFB", navEntry.responseStart, path);
  } catch {
    /* ignore */
  }

  const observe = (type: string, cb: (entries: PerformanceEntry[]) => void) => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered: true } as PerformanceObserverInit);
      return po;
    } catch {
      return null;
    }
  };

  let lcp = 0;
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
    if (last) lcp = last.startTime;
  });

  let cls = 0;
  observe("layout-shift", (entries) => {
    for (const e of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!e.hadRecentInput) cls += e.value;
    }
  });

  let inp = 0;
  observe("event", (entries) => {
    for (const e of entries as (PerformanceEntry & { duration: number; interactionId?: number })[]) {
      if (e.interactionId && e.duration > inp) inp = e.duration;
    }
  });

  const finalise = () => {
    if (document.visibilityState !== "hidden") return;
    if (lcp > 0) report("LCP", lcp, path);
    if (cls > 0) report("CLS", cls * 1000, path); // stored ×1000 to keep it an integer-ish value
    if (inp > 0) report("INP", inp, path);
    lcp = 0;
    cls = 0;
    inp = 0;
  };

  document.addEventListener("visibilitychange", finalise);
  window.addEventListener("pagehide", finalise);
}

/** Called when a client-side navigation begins. */
export function markNavigationStart(path: string) {
  pending = { path, start: performance.now() };
}

/** Called when the destination route has finished loading. */
export function markNavigationEnd(path: string) {
  if (!pending) return;
  const duration = performance.now() - pending.start;
  pending = null;
  // Ignore absurd values (tab suspended mid-navigation).
  if (duration <= 0 || duration > 60_000) return;
  track({ event: "route_transition", path, props: { ms: Math.round(duration) } });
}
