import type { PermissionKey } from "@/lib/team-permissions";

/**
 * Maps tenant app routes to the permission a teammate must have.
 * Longest prefix wins. Routes not listed here are open to any teammate.
 */
const ROUTE_PERMS: { prefix: string; exact?: boolean; perm: PermissionKey }[] = [
  { prefix: "/app", exact: true, perm: "dashboard" },
  { prefix: "/app/campaigns", perm: "campaigns" },
  { prefix: "/app/inbox", perm: "inbox" },
  { prefix: "/app/audience", perm: "audience" },
  { prefix: "/app/segments", perm: "segments" },
  { prefix: "/app/suppressions", perm: "suppressions" },
  { prefix: "/app/setup-sms", perm: "setup_sms" },
  { prefix: "/app/setup-10dlc", perm: "setup_sms" },
  { prefix: "/app/toll-free-verification", perm: "setup_sms" },
  { prefix: "/app/team", perm: "team" },
  { prefix: "/app/settings", perm: "settings" },
  { prefix: "/app/billing", perm: "billing" },
  { prefix: "/app/checkout", perm: "billing" },
];

/** Routes every teammate may open regardless of permissions. */
const ALWAYS_ALLOWED = ["/app/my-academy", "/app/pricing-calculator", "/app/onboarding"];

export function requiredPermissionFor(pathname: string): PermissionKey | null {
  if (ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;
  let match: { perm: PermissionKey; len: number } | null = null;
  for (const r of ROUTE_PERMS) {
    const hit = r.exact ? pathname === r.prefix : pathname === r.prefix || pathname.startsWith(r.prefix + "/");
    if (hit && (!match || r.prefix.length > match.len)) match = { perm: r.perm, len: r.prefix.length };
  }
  return match?.perm ?? null;
}

/** First landing page a teammate with these permissions is allowed to open. */
export function firstAllowedРath(perms: Partial<Record<PermissionKey, boolean>>): string {
  const order: { path: string; perm: PermissionKey }[] = [
    { path: "/app", perm: "dashboard" },
    { path: "/app/inbox", perm: "inbox" },
    { path: "/app/campaigns", perm: "campaigns" },
    { path: "/app/audience", perm: "audience" },
    { path: "/app/segments", perm: "segments" },
    { path: "/app/suppressions", perm: "suppressions" },
    { path: "/app/setup-sms", perm: "setup_sms" },
    { path: "/app/team", perm: "team" },
    { path: "/app/billing", perm: "billing" },
    { path: "/app/settings", perm: "settings" },
  ];
  return order.find((o) => perms[o.perm])?.path ?? "/app/my-academy";
}
