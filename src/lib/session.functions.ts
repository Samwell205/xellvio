import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActingAccount } from "@/lib/acting-account.server";
import { isProfileComplete } from "@/lib/profile-requirements";
import type { Permissions } from "@/lib/team-permissions";

export type SessionInfo = {
  userId: string;
  isOwner: boolean;
  role: "owner" | "admin" | "editor" | "viewer";
  permissions: Permissions;
  workspaceOwnerId: string;
  workspaceOwnerName: string | null;
  workspaceOwnerEmail: string | null;
  businessName: string | null;
  profileComplete: boolean;
};

/**
 * Returns the acting workspace + permissions for the signed-in user.
 * Used by the sidebar and route guards to gate UI.
 */
export const getMySession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionInfo> => {
    const acting = await resolveActingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct } = await supabaseAdmin.from("accounts").select("legal_business_name,company,website_url,business_address,contact_email,phone,industry,team_size,onboarding_status").eq("id", acting.accountId).maybeSingle();
    const businessName = acct?.legal_business_name || acct?.company || null;
    const profileComplete = isProfileComplete(acct);
    return {
      businessName,
      profileComplete,
      userId: acting.userId,
      isOwner: acting.isOwner,
      role: acting.role,
      permissions: acting.permissions,
      workspaceOwnerId: acting.accountId,
      workspaceOwnerName: acting.ownerName,
      workspaceOwnerEmail: acting.ownerEmail,
    };
  });
