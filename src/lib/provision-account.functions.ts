import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Provisions the caller's Telnyx Messaging Profile if they don't already have
 * one. Idempotent — safe to call on every app load. Called automatically:
 *   • after signup (new tenants)
 *   • on first authenticated app load (backfill for existing tenants)
 */
export const provisionCurrentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { ensureMessagingProfileForAccount } = await import("./telnyx.server");
      const profileId = await ensureMessagingProfileForAccount(context.userId);
      return { ok: true as const, messagingProfileId: profileId };
    } catch (e: any) {
      // Non-fatal — user can still browse the app; a later action will retry.
      return { ok: false as const, error: e?.message ?? String(e) };
    }
  });
