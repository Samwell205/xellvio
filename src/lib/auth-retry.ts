/**
 * Network resilience helpers for browser auth calls.
 *
 * Symptom this fixes: tenants seeing "Failed to fetch" on sign-in. That error is a
 * transport-level failure (dropped connection / edge hiccup / a stale broken session
 * triggering a token refresh that never completes) — not a credentials problem — so a
 * single attempt surfaces a scary error even though the very next attempt succeeds.
 */

function isNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed") ||
    msg.includes("err_network") ||
    msg.includes("connection")
  );
}

export const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the server. Check your connection and try again — your details are still here.";

/**
 * Runs a Supabase auth call, retrying only transport failures (never credential errors).
 * Supabase returns credential problems as `{ error }`, so those exit immediately.
 */
export async function withAuthRetry<T extends { error: unknown }>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      // A returned error object means the server answered — don't retry.
      if (result?.error && isNetworkError(result.error)) {
        lastError = result.error;
      } else {
        return result;
      }
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      lastError = err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error(NETWORK_ERROR_MESSAGE, { cause: lastError });
}

export function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Authentication failed";
  if (isNetworkError(err) || raw === NETWORK_ERROR_MESSAGE) return NETWORK_ERROR_MESSAGE;
  const lower = raw.toLowerCase();
  if (
    lower.includes("weak") ||
    lower.includes("pwned") ||
    lower.includes("breach") ||
    lower.includes("compromis")
  ) {
    return "This password has appeared in a known data breach. Please pick a different, unique password (12+ characters with numbers and symbols).";
  }
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again, or use “Forgot password?”.";
  }
  return raw;
}

/**
 * Clears a locally stored session whose refresh token the server no longer knows
 * (seen in logs as `refresh_token_not_found`). Left in place it makes supabase-js
 * fire failing refresh calls that can abort the sign-in request.
 */
export async function clearStaleSession(): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { error } = await supabase.auth.getUser();
    if (error) await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* best-effort */
  }
}
