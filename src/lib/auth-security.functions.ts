import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Invalidates ALL refresh tokens for the currently-authenticated user (global sign-out).
 * Call this right after a successful password update so old sessions on other
 * devices can no longer refresh, and the user is forced to sign in with the new password.
 */
export const invalidateAllSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(context.userId, "global");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
