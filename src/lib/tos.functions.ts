// Terms of Service acceptance + per-campaign compliance re-confirmation.
// Called from the auth page (signup), the app shell (re-acceptance modal),
// and the campaign wizard (per-campaign checkbox).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOS_CURRENT_VERSION } from "./tos";

const IpUaSchema = z.object({
  ipAddress: z.string().max(80).optional(),
  userAgent: z.string().max(500).optional(),
});

/**
 * Record account-level acceptance of the current ToS version and mark the
 * account row so downstream send paths can gate on it.
 */
export const acceptTos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IpUaSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: insErr } = await supabaseAdmin.from("tos_acceptances").upsert(
      {
        tenant_account_id: userId,
        tos_version: TOS_CURRENT_VERSION,
        ip_address: data.ipAddress ?? null,
        user_agent: data.userAgent ?? null,
      },
      { onConflict: "tenant_account_id,tos_version" },
    );
    if (insErr) {
      console.error("[acceptTos] tos_acceptances upsert failed", insErr);
      throw new Error(`Could not record acceptance: ${insErr.message}`);
    }
    const { error: updErr } = await supabaseAdmin
      .from("accounts")
      .update({ tos_current_version_accepted: TOS_CURRENT_VERSION })
      .eq("id", userId);
    if (updErr) {
      console.error("[acceptTos] accounts update failed", updErr);
      throw new Error(`Could not mark account accepted: ${updErr.message}`);
    }

    return { ok: true, version: TOS_CURRENT_VERSION };
  });

/**
 * Whether the calling tenant has accepted the current ToS version. Used by
 * the app shell to decide whether to show the re-acceptance modal, and
 * server-side by every send path to block non-accepting tenants.
 */
export const getTosStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("accounts")
      .select("tos_current_version_accepted")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[getTosStatus] read failed", { userId, error });
    }
    const stored = data?.tos_current_version_accepted ?? null;
    const accepted = stored === TOS_CURRENT_VERSION;
    console.log("[getTosStatus]", { userId, stored, current: TOS_CURRENT_VERSION, accepted });
    return { accepted, currentVersion: TOS_CURRENT_VERSION };
  });

const CampaignAcceptSchema = z.object({
  campaignId: z.string().uuid(),
  ipAddress: z.string().max(80).optional(),
  userAgent: z.string().max(500).optional(),
});

/**
 * Per-campaign compliance re-confirmation. Recorded at the moment the tenant
 * clicks "Launch campaign". Required by the dispatcher before it will process
 * a campaign.
 */
export const acceptCampaignTos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CampaignAcceptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("campaign_tos_acceptances").upsert(
      {
        campaign_id: data.campaignId,
        tenant_account_id: userId,
        tos_version: TOS_CURRENT_VERSION,
        ip_address: data.ipAddress ?? null,
        user_agent: data.userAgent ?? null,
      },
      { onConflict: "campaign_id" },
    );
    return { ok: true };
  });
