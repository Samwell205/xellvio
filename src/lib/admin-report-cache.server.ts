/**
 * Short-lived cache for expensive all-time admin reports (finance totals,
 * per-tenant margins). These scan the full message history, so recomputing
 * them on every page view slowed the whole database. Admins can force a
 * refresh; otherwise results are reused for `ttlMs`.
 */
export const ADMIN_REPORT_TTL_MS = 10 * 60_000;

export async function cachedReport<T>(
  key: string,
  compute: () => Promise<T>,
  opts: { refresh?: boolean; ttlMs?: number } = {},
): Promise<{ value: T; computedAt: string; cached: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as any;
  const ttl = opts.ttlMs ?? ADMIN_REPORT_TTL_MS;

  if (!opts.refresh) {
    const { data } = await sb
      .from("admin_report_cache")
      .select("payload,computed_at")
      .eq("key", key)
      .maybeSingle();
    if (data && Date.now() - new Date(data.computed_at).getTime() < ttl) {
      return { value: data.payload as T, computedAt: data.computed_at, cached: true };
    }
  }

  const value = await compute();
  const computedAt = new Date().toISOString();
  const { error } = await sb
    .from("admin_report_cache")
    .upsert({ key, payload: value as any, computed_at: computedAt }, { onConflict: "key" });
  if (error) console.error("[admin report cache] store failed", key, error.message);
  return { value, computedAt, cached: false };
}
