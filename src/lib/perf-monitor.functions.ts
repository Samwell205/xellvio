import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin performance read model.
 *
 * Everything here is aggregated from real measurements the browser reported
 * (`web_vital`, `route_transition`) and from real server error rows. Nothing is
 * simulated, and averages are withheld when the sample is too small to mean
 * anything.
 */

const MIN_SAMPLE = 5;

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

export type PerfReport = {
  days: number;
  sampleSize: number;
  routes: { path: string; samples: number; p50: number | null; p75: number | null; p95: number | null }[];
  vitals: { metric: string; samples: number; p75: number | null; unit: string; rating: string | null }[];
  slowestVitalPages: { path: string; metric: string; p75: number | null; samples: number }[];
  errors: { message: string; count: number; lastSeen: string }[];
  minSample: number;
};

const WindowSchema = z.object({ days: z.number().int().min(1).max(90).default(7) });

const VITAL_UNITS: Record<string, string> = { LCP: "ms", INP: "ms", TTFB: "ms", CLS: "×1000" };

function rateVital(metric: string, v: number | null): string | null {
  if (v == null) return null;
  if (metric === "LCP") return v <= 2500 ? "good" : v <= 4000 ? "needs work" : "poor";
  if (metric === "INP") return v <= 200 ? "good" : v <= 500 ? "needs work" : "poor";
  if (metric === "TTFB") return v <= 800 ? "good" : v <= 1800 ? "needs work" : "poor";
  if (metric === "CLS") return v <= 100 ? "good" : v <= 250 ? "needs work" : "poor";
  return null;
}

export const getPerfReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WindowSchema.parse(d ?? {}))
  .handler(async ({ context, data }): Promise<PerfReport> => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const { data: rows } = await db
      .from("growth_events")
      .select("event, path, props, created_at")
      .in("event", ["route_transition", "web_vital"])
      .gte("created_at", since)
      .limit(20000);

    const all: any[] = rows ?? [];

    // Route transition timings per path.
    const byPath = new Map<string, number[]>();
    for (const r of all) {
      if (r.event !== "route_transition") continue;
      const ms = Number(r.props?.ms);
      if (!Number.isFinite(ms)) continue;
      const key = (r.path ?? "/").replace(/\/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, "/:id");
      const list = byPath.get(key) ?? [];
      list.push(ms);
      byPath.set(key, list);
    }
    const routes = [...byPath.entries()]
      .map(([path, list]) => ({
        path,
        samples: list.length,
        p50: list.length >= MIN_SAMPLE ? percentile(list, 50) : null,
        p75: list.length >= MIN_SAMPLE ? percentile(list, 75) : null,
        p95: list.length >= MIN_SAMPLE ? percentile(list, 95) : null,
      }))
      .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0) || b.samples - a.samples)
      .slice(0, 25);

    // Core Web Vitals overall and per page.
    const byMetric = new Map<string, number[]>();
    const byMetricPath = new Map<string, number[]>();
    for (const r of all) {
      if (r.event !== "web_vital") continue;
      const metric = String(r.props?.metric ?? "");
      const value = Number(r.props?.value);
      if (!metric || !Number.isFinite(value)) continue;
      byMetric.set(metric, [...(byMetric.get(metric) ?? []), value]);
      const k = `${metric}|${r.path ?? "/"}`;
      byMetricPath.set(k, [...(byMetricPath.get(k) ?? []), value]);
    }
    const vitals = ["LCP", "INP", "CLS", "TTFB"]
      .filter((m) => byMetric.has(m))
      .map((metric) => {
        const list = byMetric.get(metric)!;
        const p75 = list.length >= MIN_SAMPLE ? percentile(list, 75) : null;
        return {
          metric,
          samples: list.length,
          p75,
          unit: VITAL_UNITS[metric] ?? "",
          rating: rateVital(metric, p75),
        };
      });

    const slowestVitalPages = [...byMetricPath.entries()]
      .filter(([k, list]) => k.startsWith("LCP|") && list.length >= MIN_SAMPLE)
      .map(([k, list]) => ({
        path: k.split("|")[1],
        metric: "LCP",
        p75: percentile(list, 75),
        samples: list.length,
      }))
      .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0))
      .slice(0, 10);

    // Real error rows, if the project keeps an error log table.
    let errors: PerfReport["errors"] = [];
    try {
      const { data: errRows } = await db
        .from("error_logs")
        .select("message, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      const counts = new Map<string, { count: number; lastSeen: string }>();
      for (const e of errRows ?? []) {
        const msg = String(e.message ?? "").slice(0, 160);
        if (!msg) continue;
        const prev = counts.get(msg);
        counts.set(msg, {
          count: (prev?.count ?? 0) + 1,
          lastSeen: prev?.lastSeen ?? e.created_at,
        });
      }
      errors = [...counts.entries()]
        .map(([message, v]) => ({ message, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch {
      errors = [];
    }

    return {
      days: data.days,
      sampleSize: all.length,
      routes,
      vitals,
      slowestVitalPages,
      errors,
      minSample: MIN_SAMPLE,
    };
  });
