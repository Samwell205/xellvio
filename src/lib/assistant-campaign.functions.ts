import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const prepareAssistantLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { prepareAssistantCampaignLaunch } = await import("./assistant-campaign.server");
    return prepareAssistantCampaignLaunch(context.userId, data.campaignId);
  });
export const confirmAssistantLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        consent: z.boolean(),
        choice: z.enum(["tested", "skipped"]),
        userAgent: z.string().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { confirmAssistantCampaignLaunch } = await import("./assistant-campaign.server");
    return confirmAssistantCampaignLaunch(
      context.userId,
      data.id,
      data.consent,
      data.choice,
      data.userAgent,
    );
  });
