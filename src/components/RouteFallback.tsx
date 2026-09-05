import { useRouterState } from "@tanstack/react-router";
import {
  AnalyticsSkeleton,
  BuilderSkeleton,
  DashboardSkeleton,
  DetailPageSkeleton,
  ListPageSkeleton,
  SettingsSkeleton,
  TablePageSkeleton,
  TemplateLibrarySkeleton,
  WorkflowSkeleton,
} from "./skeletons";

/**
 * Default route pending UI. Picks a skeleton that matches the shape of the
 * destination page so navigation never shows an empty content area.
 */
export function RouteFallback() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  return <div className="p-1">{skeletonFor(pathname)}</div>;
}

export function skeletonFor(pathname: string) {
  const p = pathname.replace(/\/+$/, "") || "/";

  if (p === "/app" || p === "/admin") return <DashboardSkeleton />;
  if (p.startsWith("/app/automations/") || p.startsWith("/app/flows")) return <WorkflowSkeleton />;
  if (p.startsWith("/app/automations")) return <ListPageSkeleton label="Loading automations" />;
  if (p.startsWith("/app/landing-pages") || p.startsWith("/app/signup-forms"))
    return <BuilderSkeleton />;
  if (p.startsWith("/app/campaigns/") && p.endsWith("/report")) return <AnalyticsSkeleton />;
  if (p.startsWith("/app/campaigns/new")) return <DetailPageSkeleton />;
  if (p.startsWith("/app/campaigns/")) return <DetailPageSkeleton />;
  if (p.startsWith("/app/campaigns")) return <ListPageSkeleton label="Loading campaigns" />;
  if (p.startsWith("/app/audience") || p.startsWith("/app/lists") || p.startsWith("/app/segments"))
    return <TablePageSkeleton label="Loading contacts" />;
  if (p.startsWith("/app/suppressions")) return <TablePageSkeleton label="Loading suppressions" />;
  if (p.startsWith("/app/inbox")) return <ListPageSkeleton label="Loading inbox" />;
  if (p.startsWith("/app/settings") || p.startsWith("/app/team") || p.startsWith("/app/developer"))
    return <SettingsSkeleton />;
  if (p.startsWith("/app/billing") || p.startsWith("/app/checkout")) return <DetailPageSkeleton />;
  if (p.startsWith("/templates") || p.startsWith("/app/use-template") || p.startsWith("/app/apps"))
    return <TemplateLibrarySkeleton />;
  if (p.startsWith("/admin")) return <AnalyticsSkeleton />;
  return <ListPageSkeleton />;
}
