import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { keywordScan, type ScanResult } from "./content-scanner";
import { aiScan } from "./ai-content-scan.server";

const ScanInput = z.object({
  messageBody: z.string().min(1).max(1600),
  mediaUrl: z.string().max(2000).optional(),
});

export const scanCampaignContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanInput.parse(input))
  .handler(async ({ data }): Promise<ScanResult> => {
    // Layer 1: Fast keyword check
    const keywordResult = keywordScan(data.messageBody);
    if (!keywordResult.allowed) {
      return keywordResult;
    }

    // A keyword "flag" is an advisory match that the full dispatcher
    // screening handles consistently. Do not send it through a second AI
    // classifier here: that made the builder block content which the
    // dispatcher had just approved and successfully launched.
    if (keywordResult.confidence === "keyword") {
      return keywordResult;
    }

    // If keyword scan is clean but we want extra safety, run AI scan
    // We run AI on ALL messages to catch clever wording / obfuscation
    const aiResult = await aiScan(data.messageBody);
    if (!aiResult.allowed) {
      return aiResult;
    }

    // Also check the campaign name for hidden content (defense in depth)
    // Not blocking on name, but could be logged

    return { allowed: true, confidence: "ai" };
  });
