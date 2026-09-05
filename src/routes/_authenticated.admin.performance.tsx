import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getPerfReport } from "@/lib/perf-monitor.functions";
import { AnalyticsSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/admin/performance")({
  head: () => ({
    meta: [
      { title: "Speed & experience monitoring — Xellvio admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PerformancePage,
});

function ratingClass(rating: string | null) {
  if (rating === "good") return "text-emerald-600 dark:text-emerald-400";
  if (rating === "needs work") return "text-amber-600 dark:text-amber-400";
  if (rating === "poor") return "text-destructive";
  return "text-muted-foreground";
}

function PerformancePage() {
  const report = useServerFn(getPerfReport);
  const { data, isLoading } = useQuery({
    queryKey: ["perf-report", 7],
    queryFn: () => report({ data: { days: 7 } }),
  });

  if (isLoading) return <AnalyticsSkeleton />;
  if (!data) return null;

  const noData = data.sampleSize === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Speed & experience</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Measured from real visits over the last {data.days} days. Figures appear once at least{" "}
          {data.minSample} measurements exist for a page.
        </p>
      </div>

      {noData && (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Gauge className="size-5" />
          </span>
          <h2 className="text-base font-semibold">No measurements yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Real visits are now being timed. Come back once people have browsed a few pages and
            you'll see loading speed and page-switch timings here.
          </p>
        </Card>
      )}

      {!!data.vitals.length && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.vitals.map((v) => (
            <Card key={v.metric} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {v.metric === "LCP"
                  ? "Main content appears"
                  : v.metric === "INP"
                    ? "Response to taps"
                    : v.metric === "CLS"
                      ? "Layout stability"
                      : "Server first byte"}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {v.p75 == null ? "—" : v.metric === "CLS" ? (v.p75 / 1000).toFixed(3) : `${v.p75} ms`}
              </p>
              <p className={`mt-1 text-xs font-medium ${ratingClass(v.rating)}`}>
                {v.rating ?? "Collecting"} · {v.samples} measurement{v.samples === 1 ? "" : "s"}
              </p>
            </Card>
          ))}
        </div>
      )}

      {!!data.routes.length && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Time to switch pages</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How long a page takes to appear after someone clicks a link inside the app.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">Page</th>
                  <th className="py-2 text-right">Typical</th>
                  <th className="py-2 text-right">Slower visits</th>
                  <th className="py-2 text-right">Worst</th>
                  <th className="py-2 text-right">Samples</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((r) => (
                  <tr key={r.path} className="border-t">
                    <td className="py-2 font-medium">{r.path}</td>
                    <td className="py-2 text-right">{r.p50 == null ? "—" : `${r.p50} ms`}</td>
                    <td className="py-2 text-right">{r.p75 == null ? "—" : `${r.p75} ms`}</td>
                    <td className="py-2 text-right">{r.p95 == null ? "—" : `${r.p95} ms`}</td>
                    <td className="py-2 text-right text-muted-foreground">{r.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!!data.slowestVitalPages.length && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Slowest pages to show their main content</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.slowestVitalPages.map((p) => (
              <li key={p.path} className="flex items-center justify-between gap-3 border-t pt-2">
                <span className="truncate font-medium">{p.path}</span>
                <span className="shrink-0 text-muted-foreground">
                  {p.p75} ms · {p.samples} measurement{p.samples === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!!data.errors.length && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Most frequent errors</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.errors.map((e) => (
              <li key={e.message} className="border-t pt-2">
                <p className="truncate font-medium">{e.message}</p>
                <p className="text-xs text-muted-foreground">
                  {e.count} time{e.count === 1 ? "" : "s"} · last {new Date(e.lastSeen).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
