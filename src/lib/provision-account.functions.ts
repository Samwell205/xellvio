import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
      // Only provision the caller's OWN workspace. Invited team members
      // operate inside the owner's workspace and must not create a Telnyx
      // messaging profile under their empty personal account.
      const { resolveActingAccount } = await import("./acting-account.server");
      const acting = await resolveActingAccount(context.userId);
      if (!acting.isOwner) return { ok: true as const, skipped: "member" as const };
      const { ensureMessagingProfileForAccount } = await import("./telnyx.server");
      const profileId = await ensureMessagingProfileForAccount(context.userId);
      return { ok: true as const, messagingProfileId: profileId };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? String(e) };
    }
  });


/**
 * Admin-only: backfill Telnyx Messaging Profiles for every dormant tenant
 * (accounts with no telnyx_messaging_profile_id). Safe to re-run.
 */
export const adminBackfillProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (isAdmin !== true) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMessagingProfileForAccount } = await import("./telnyx.server");

    const { data: rows, error } = await supabaseAdmin
      .from("accounts")
      .select("id,email")
      .is("telnyx_messaging_profile_id", null)
      .limit(data.limit ?? 100);
    if (error) throw error;

    const results: Array<{ accountId: string; email: string | null; ok: boolean; error?: string; profileId?: string }> = [];
    for (const r of rows ?? []) {
      try {
        const profileId = await ensureMessagingProfileForAccount(r.id);
        results.push({ accountId: r.id, email: r.email, ok: true, profileId });
      } catch (e: any) {
        results.push({ accountId: r.id, email: r.email, ok: false, error: e?.message ?? String(e) });
      }
    }
    return {
      scanned: rows?.length ?? 0,
      provisioned: results.filter((x) => x.ok).length,
      failed: results.filter((x) => !x.ok).length,
      results,
    };
  });
