/**
 * Client-side caches for the two checks that used to run on *every* internal
 * navigation into the signed-in app:
 *
 *   1. the current user (previously `supabase.auth.getUser()` — a network call)
 *   2. the `has_role('admin')` RPC
 *
 * Both are stable for the lifetime of a session, so re-fetching them per route
 * change added two round-trips of dead time before any page could render.
 * These helpers keep the security checks intact (the session is still verified
 * and RLS still enforces everything server-side) while making repeat
 * navigation instant.
 */
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const USER_TTL = 5 * 60_000;
const ROLE_TTL = 5 * 60_000;

let userCache: { at: number; user: User | null } | null = null;
let userInflight: Promise<User | null> | null = null;

let adminCache: { at: number; isAdmin: boolean } | null = null;
let adminInflight: Promise<boolean> | null = null;

let accountEnsured = false;

/**
 * Returns the signed-in user. Uses the locally stored session (no network) when
 * it is present and unexpired, and only calls the auth server when the cached
 * copy is stale or missing.
 */
export async function getCachedUser(): Promise<User | null> {
  const now = Date.now();
  if (userCache && now - userCache.at < USER_TTL) return userCache.user;
  if (userInflight) return userInflight;

  userInflight = (async () => {
    // Local read first: the JWT is signed, so a valid unexpired session is
    // trustworthy for routing purposes without a round-trip.
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (session?.user && (session.expires_at ?? 0) * 1000 > Date.now() + 30_000) {
      userCache = { at: Date.now(), user: session.user };
      return session.user;
    }
    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : (data.user ?? null);
    userCache = { at: Date.now(), user };
    return user;
  })().finally(() => {
    userInflight = null;
  });

  return userInflight;
}

/** Cached `has_role('admin')` check. */
export async function getCachedIsAdmin(): Promise<boolean> {
  const now = Date.now();
  if (adminCache && now - adminCache.at < ROLE_TTL) return adminCache.isAdmin;
  if (adminInflight) return adminInflight;

  adminInflight = (async () => {
    const { data } = await supabase.rpc("has_role", { _role: "admin" });
    const isAdmin = data === true;
    adminCache = { at: Date.now(), isAdmin };
    return isAdmin;
  })().finally(() => {
    adminInflight = null;
  });

  return adminInflight;
}

/** True the first time it is called in a session; used to run one-off setup once. */
export function claimAccountEnsure(): boolean {
  if (accountEnsured) return false;
  accountEnsured = true;
  return true;
}

/** Called on sign-in / sign-out so nothing stale survives an identity change. */
export function clearAuthCache() {
  userCache = null;
  adminCache = null;
  accountEnsured = false;
}
