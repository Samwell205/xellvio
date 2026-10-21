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

    // Full screening blocks keyword flags pending review. The builder must
    // not call these approved or ask a second classifier for another opinion.
    if (keywordResult.confidence === "keyword") {
      return { ...keywordResult, allowed: false };
    }

    // If keyword scan is clean but we want extra safety, run AI scan
    // We run AI on ALL messages to catch clever wording / obfuscation
    const aiResult = await aiScan(data.messageBody);
    if (aiResult.unavailable) {
      return {
        ...aiResult,
        allowed: false,
        reason: "This message could not be safety-checked right now, so it was not approved. Please try again later.",
      };
    }
    if (!aiResult.allowed) {
      return aiResult;
    }

    // Also check the campaign name for hidden content (defense in depth)
    // Not blocking on name, but could be logged

    return { allowed: true, confidence: "ai" };
  });
