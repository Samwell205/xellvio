/**
 * Xellvio loading design system.
 *
 * Page-shaped shimmer placeholders used as route `pendingComponent`s so a
 * navigation never shows a blank content area. Dimensions intentionally mirror
 * the real pages to avoid layout shift when content swaps in.
 */
import { cn } from "@/lib/utils";

export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[xv-shimmer_1.4s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent",
        className,
      )}
    />
  );
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="animate-in fade-in duration-150" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Shimmer className="h-7 w-56" />
        <Shimmer className="h-4 w-80" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Shimmer key={i} className="h-9 w-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <Shimmer className="h-4 w-24" />
      <Shimmer className="mt-3 h-7 w-32" />
      <Shimmer className="mt-3 h-3 w-20" />
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <Shimmer className="h-4 w-40" />
      <div className="mt-6 flex h-40 items-end gap-2">
        {[45, 70, 35, 85, 55, 65, 40, 78, 50, 60, 30, 72].map((h, i) => (
          <div key={i} className="flex-1" style={{ height: `${h}%` }}>
            <Shimmer className="h-full w-full rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className={cn("h-3.5", i === 0 ? "w-40" : "w-24")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className={cn("h-4", c === 0 ? "w-56" : "w-20")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4">
          <Shimmer className="h-9 w-9 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Shimmer className="h-4 w-1/3" />
            <Shimmer className="h-3 w-1/2" />
          </div>
          <Shimmer className="h-5 w-16 rounded-full" />
          <Shimmer className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function FiltersSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Shimmer className="h-9 w-full max-w-xs rounded-lg" />
      <Shimmer className="h-9 w-28 rounded-lg" />
      <Shimmer className="h-9 w-28 rounded-lg" />
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Shimmer className="h-3.5 w-28" />
          <Shimmer className="h-9 w-full rounded-lg" />
        </div>
      ))}
      <Shimmer className="h-9 w-32 rounded-lg" />
    </div>
  );
}

export function CardGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border bg-card">
          <Shimmer className="h-36 w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Shimmer className="h-4 w-2/3" />
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- page-level skeletons ---------- */

export function DashboardSkeleton() {
  return (
    <Frame label="Loading dashboard">
      <div className="space-y-6">
        <HeaderSkeleton />
        <StatCardsSkeleton />
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartSkeleton className="lg:col-span-2" />
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <Shimmer className="h-4 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Shimmer className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Shimmer className="h-3.5 w-3/4" />
                  <Shimmer className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <TableSkeleton rows={4} />
      </div>
    </Frame>
  );
}

export function ListPageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label}>
      <div className="space-y-6">
        <HeaderSkeleton />
        <FiltersSkeleton />
        <ListRowsSkeleton rows={6} />
      </div>
    </Frame>
  );
}

export function TablePageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label}>
      <div className="space-y-6">
        <HeaderSkeleton />
        <FiltersSkeleton />
        <TableSkeleton rows={8} cols={5} />
      </div>
    </Frame>
  );
}

export function AnalyticsSkeleton() {
  return (
    <Frame label="Loading analytics">
      <div className="space-y-6">
        <HeaderSkeleton />
        <StatCardsSkeleton />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    </Frame>
  );
}

export function BuilderSkeleton() {
  return (
    <Frame label="Loading builder">
      <div className="space-y-4">
        <HeaderSkeleton actions={2} />
        <div className="grid gap-4 lg:grid-cols-[240px_1fr_300px]">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Shimmer key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
          <div className="min-h-[420px] space-y-4 rounded-xl border bg-card p-6">
            <Shimmer className="h-40 w-full rounded-lg" />
            <Shimmer className="h-6 w-2/3" />
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-4 w-5/6" />
            <Shimmer className="h-24 w-full rounded-lg" />
          </div>
          <div className="hidden space-y-3 rounded-xl border bg-card p-4 lg:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Shimmer className="h-3 w-20" />
                <Shimmer className="h-8 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function WorkflowSkeleton() {
  return (
    <Frame label="Loading automation">
      <div className="space-y-4">
        <HeaderSkeleton actions={2} />
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Shimmer className="h-3 w-24" />
            {Array.from({ length: 7 }).map((_, i) => (
              <Shimmer key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <div className="relative min-h-[460px] rounded-xl border bg-card p-8">
            <div className="mx-auto flex max-w-xs flex-col items-center gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex w-full flex-col items-center gap-4">
                  <div className="w-full rounded-xl border bg-background p-4">
                    <Shimmer className="h-3.5 w-24" />
                    <Shimmer className="mt-2 h-3 w-40" />
                  </div>
                  {i < 3 && <Shimmer className="h-8 w-px" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function TemplateLibrarySkeleton() {
  return (
    <Frame label="Loading templates">
      <div className="space-y-6">
        <HeaderSkeleton />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <FiltersSkeleton />
        <CardGridSkeleton />
      </div>
    </Frame>
  );
}

export function SettingsSkeleton() {
  return (
    <Frame label="Loading settings">
      <div className="space-y-6">
        <HeaderSkeleton />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
        <FormSkeleton />
      </div>
    </Frame>
  );
}

export function DetailPageSkeleton() {
  return (
    <Frame label="Loading">
      <div className="space-y-6">
        <HeaderSkeleton actions={2} />
        <StatCardsSkeleton count={3} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <FormSkeleton fields={4} />
          </div>
          <CardSkeleton />
        </div>
      </div>
    </Frame>
  );
}
