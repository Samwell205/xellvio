import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Download, Star } from "lucide-react";
import { AppLogo } from "./AppLogo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AppCardApp = {
  name: string;
  slug: string;
  tagline?: string | null;
  short_description?: string | null;
  logo_url?: string | null;
  accent_color?: string | null;
  install_count?: number;
  rating?: number;
  app_categories?: { name: string } | null;
  developers?: { company_name: string; verification_status?: string } | null;
};

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

export function AppCard({
  app,
  to,
  reason,
  className,
}: {
  app: AppCardApp;
  /** Route base — "/marketplace/apps" publicly, "/app/apps" inside the workspace. */
  to: "/marketplace/apps/$slug" | "/app/apps/$slug";
  reason?: string;
  className?: string;
}) {
  const accent = app.accent_color ?? undefined;
  return (
    <Link
      to={to}
      params={{ slug: app.slug }}
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-300",
        "hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_45px_-24px_hsl(var(--primary)/0.55)]",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-32 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
        style={{ background: accent ? `radial-gradient(circle, ${accent}55, transparent 70%)` : undefined }}
      />
      <div className="flex items-start gap-3">
        <AppLogo
          name={app.name}
          logoUrl={app.logo_url}
          accentColor={app.accent_color}
          className="group-hover:scale-105"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-semibold tracking-tight">{app.name}</h3>
            {app.developers?.verification_status === "verified" && (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified developer" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {app.developers?.company_name ? `by ${app.developers.company_name}` : app.tagline}
          </p>
        </div>
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">
        {reason || app.short_description || app.tagline}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {app.app_categories?.name && (
            <Badge variant="secondary" className="max-w-[9rem] truncate rounded-full font-normal">
              {app.app_categories.name}
            </Badge>
          )}
          {typeof app.install_count === "number" && app.install_count > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Download className="size-3" />
              {compact(app.install_count)}
            </span>
          )}
          {!!app.rating && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3 fill-current" />
              {app.rating}
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary opacity-70 transition-all group-hover:gap-2 group-hover:opacity-100">
          Connect <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
