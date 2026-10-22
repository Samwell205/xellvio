import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read-only tenant notice. Campaign access is verified through the caller's
 * RLS client before the service client reads any incident or email status.
 * Contact addresses and raw mail/provider errors are never returned. */
export const getCampaignCarrierNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign, error: accessError } = await context.supabase
      .from("campaigns").select("id").eq("id", data.campaignId).maybeSingle();
    if (accessError) throw new Error("Could not check campaign access.");
    if (!campaign) throw new Error("Campaign not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: incident, error: incidentError } = await db
      .from("campaign_spam_incidents").select("kind,paused,finalized,spam,created_at")
      .eq("campaign_id", data.campaignId).maybeSingle();
    if (incidentError) throw new Error("Carrier notice could not be loaded.");
    if (!incident) return null;
    const { data: email, error: emailError } = await db
      .from("campaign_spam_email_outbox").select("status")
      .eq("campaign_id", data.campaignId).maybeSingle();
    return {
      kind: incident.kind as "spam" | "feedback_timeout",
      paused: incident.paused === true,
      finalized: Number(incident.finalized),
      spam: Number(incident.spam),
      createdAt: String(incident.created_at),
      emailStatus: emailError || !email ? "unavailable" : String(email.status),
    };
  });
