import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lookup-only recovery, paged by stable message ID; never launches SMS or charges.
export const reconcileCampaignMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid(), after: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns").select("id, account_id").eq("id", data.campaignId).maybeSingle();
    if (cErr || !campaign) throw new Error("Campaign not found");
    if (campaign.account_id !== userId) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return recoverBoth(supabaseAdmin, data.campaignId, data.after);
  });

export const adminRecoverCampaignReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid(), after: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (error || !isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign, error: campaignError } = await supabaseAdmin.from("campaigns").select("id").eq("id", data.campaignId).maybeSingle();
    if (campaignError || !campaign) throw new Error("Campaign not found");
    return recoverBoth(supabaseAdmin, data.campaignId, data.after);
  });

async function recoverBoth(admin: any, campaignId: string, after?: string) {
  const { recoverReceiptPage } = await import("./receipt-recovery.server");
  const { recoverTwilioReceipts } = await import("./twilio-receipt-recovery.server");
  const line = after ? null : await recoverTwilioReceipts(admin, { campaignId, limit: 60, budgetMs: 10_000 });
  const page = await recoverReceiptPage(admin, campaignId, after);
  if (!line) return page;
  return { ...page, checked: page.checked + line.checked, updated: page.updated + line.updated, errors: page.errors + line.errors, stillAwaiting: page.stillAwaiting + line.stillAwaiting };
}

export const adminRecoverCampaignPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid(), after: z.string().regex(/^\d{1,6}$/).optional(), pageToken: z.string().max(4096).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (error || isAdmin !== true) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await supabaseAdmin.from("campaigns").select("id").eq("id", data.campaignId).maybeSingle();
    if (!campaign) throw new Error("Campaign not found");
    const { recoverCampaignPricePage } = await import("./twilio-price-sync.server");
    return recoverCampaignPricePage(supabaseAdmin, data.campaignId, data.after, data.pageToken);
  });
