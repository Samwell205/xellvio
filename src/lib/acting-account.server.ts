// Server-only helper: resolve the workspace ("acting account") a signed-in user
// is currently operating inside. Owners act inside their own account; invited
// teammates act inside the workspace they were invited to.

import type { PermissionKey, Permissions } from "@/lib/team-permissions";
import { PERMISSION_KEYS } from "@/lib/team-permissions";

export type ActingAccount = {
  /** The account_id every tenant query should filter by. */
  accountId: string;
  /** The signed-in user (always their own auth.uid()). */
  userId: string;
  /** True when the signed-in user IS the workspace owner. */
  isOwner: boolean;
  /** Role granted on this workspace ('owner' for owners, else account_members.role). */
  role: "owner" | "admin" | "editor" | "viewer";
  /** Effective per-feature permissions. Owners always have all keys true. */
  permissions: Permissions;
  /** Owner's display name (for "Working in {name}'s workspace" hint). */
  ownerName: string | null;
  ownerEmail: string | null;
};

const OWNER_PERMS: Permissions = Object.fromEntries(
  PERMISSION_KEYS.map((k) => [k, true]),
) as Permissions;

/**
 * Resolve acting account for a given signed-in user id. Reads via the admin
 * client so it bypasses RLS (cheap, deterministic).
 */
export async function resolveActingAccount(userId: string): Promise<ActingAccount> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: membership } = await supabaseAdmin
    .from("account_members")
    .select("account_id, role, permissions")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("accepted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // If the user has an active membership AND is not themselves that account's owner → act as member.
  if (membership && membership.account_id !== userId) {
    const { data: owner } = await supabaseAdmin
      .from("accounts")
      .select("full_name, company, email")
      .eq("id", membership.account_id)
      .maybeSingle();
    const permsRaw = (membership.permissions ?? {}) as Record<string, unknown>;
    const perms: Permissions = {};
    for (const k of PERMISSION_KEYS) {
      if (membership.role === "admin" || permsRaw[k] === true) perms[k] = true;
    }
    return {
      accountId: membership.account_id,
      userId,
      isOwner: false,
      role: (membership.role as "admin" | "editor" | "viewer") ?? "viewer",
      permissions: perms,
      ownerName: owner?.full_name || owner?.company || null,
      ownerEmail: owner?.email ?? null,
    };
  }

  return {
    accountId: userId,
    userId,
    isOwner: true,
    role: "owner",
    permissions: OWNER_PERMS,
    ownerName: null,
    ownerEmail: null,
  };
}

/** Throw a friendly 403-style error if the acting user lacks the given permission. */
export function assertPermission(acting: ActingAccount, key: PermissionKey): void {
  if (acting.isOwner) return;
  if (acting.permissions[key]) return;
  throw new Error(
    `You don't have permission to access this area. Ask the workspace owner to enable "${key}" for your account.`,
  );
}

/** Throw if the acting user is not the workspace owner. */
export function assertOwner(acting: ActingAccount): void {
  if (!acting.isOwner) {
    throw new Error("Only the workspace owner can perform this action.");
  }
}
