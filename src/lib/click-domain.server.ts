// Per-tenant branded click domain for tracked short links.
//
// Carriers score the link domain heavily. Every tenant sharing one
// xellvio.com/r/… domain means one tenant's spammy campaign hurts everyone's
// delivery. An admin can give a tenant its own domain (e.g. links.mybrand.com)
// which must be connected to this project as a custom domain so /r/<code>
// resolves there.

/** Canonical fallback origin used when a tenant has no branded domain. */
export function defaultClickBase(): string {
  const raw = process.env['PUBLIC_BASE_URL'] || process.env['SITE_URL'] || "https://xellvio.com";
  return raw.replace(/\/+$/, "").replace("https://www.xellvio.com", "https://xellvio.com");
}

/** Normalise admin input ("Links.Brand.com/", "https://links.brand.com") to an origin. */
export function normalizeClickDomain(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const host = raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  return host;
}

/**
 * Origin that tracked links for this account should be built on.
 * Falls back to the shared platform origin.
 */
export async function clickBaseUrl(accountId: string | null | undefined): Promise<string> {
  const fallback = defaultClickBase();
  if (!accountId) return fallback;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("click_domain")
      .eq("id", accountId)
      .maybeSingle();
    const host = normalizeClickDomain((data as { click_domain?: string | null } | null)?.click_domain);
    return host ? `https://${host}` : fallback;
  } catch {
    return fallback;
  }
}
