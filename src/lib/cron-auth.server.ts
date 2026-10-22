/**
 * Authenticates scheduled-job calls. The scheduler sends `x-cron-secret`
 * read from the service-role-only internal_job_secrets table; the public
 * publishable key is NOT accepted because browsers have it.
 */
let cached: { value: string; at: number } | null = null;

async function loadSecret(): Promise<string | null> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("internal_job_secrets")
    .select("value")
    .eq("name", "cron")
    .maybeSingle();
  if (error || !data?.value) return null;
  cached = { value: data.value as string, at: Date.now() };
  return cached.value;
}

export async function isAuthorizedCronRequest(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided.length < 32) return false;
  const secret = await loadSecret();
  return !!secret && provided === secret;
}
