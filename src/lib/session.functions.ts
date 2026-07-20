import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActingAccount } from "@/lib/acting-account.server";
import type { Permissions } from "@/lib/team-permissions";

export type SessionInfo = {
  userId: string;
  isOwner: boolean;
  role: "owner" | "admin" | "editor" | "viewer";
  permissions: Permissions;
  workspaceOwnerId: string;
  workspaceOwnerName: string | null;
  workspaceOwnerEmail: string | null;
};

/**
 * Returns the acting workspace + permissions for the signed-in user.
 * Used by the sidebar and route guards to gate UI.
 */
export const getMySession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionInfo> => {
    const acting = await resolveActingAccount(context.userId);
    return {
      userId: acting.userId,
      isOwner: acting.isOwner,
      role: acting.role,
      permissions: acting.permissions,
      workspaceOwnerId: acting.accountId,
      workspaceOwnerName: acting.ownerName,
      workspaceOwnerEmail: acting.ownerEmail,
    };
  });
