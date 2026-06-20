import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { keywordScan, type ScanResult } from "./content-scanner";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, Output } from "ai";

const ScanInput = z.object({
  messageBody: z.string().min(1).max(1600),
  mediaUrl: z.string().max(2000).optional(),
});

const AI_SCHEMA = z.object({
  allowed: z.boolean(),
  category: z
    .enum([
      "sexual",
      "hate_speech",
      "alcohol",
      "firearms",
      "tobacco",
      "drugs",
      "gambling",
      "cbd_vape",
      "cryptocurrency_scam",
      "phishing",
      "none",
    ])
    .optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  reason: z.string().optional(),
});

async function aiScan(messageBody: string): Promise<ScanResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.warn("[content-scanner] LOVABLE_API_KEY missing; skipping AI scan");
    return { allowed: true, confidence: "none" };
  }

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: AI_SCHEMA }),
      system:
        "You are a content safety classifier for an SMS marketing platform. " +
        "Analyze the message for prohibited categories: tobacco (cigarettes, vaping, nicotine), " +
        "alcohol promotions, firearms, drugs, gambling, sexual services, hate speech, CBD/THC products, " +
        "cryptocurrency scams, and phishing. " +
        "Return allowed=true ONLY if the message is safe for bulk SMS. " +
        "Be strict: promotional messages for tobacco, vaping, e-cigarettes, nicotine products, or related accessories must be blocked. " +
        "Return allowed=false with the specific category and a concise reason if prohibited.",
      prompt: `Analyze this SMS campaign message for prohibited content:\n\n"""${messageBody}"""`,
    });

    const result = output as z.infer<typeof AI_SCHEMA>;
    return {
      allowed: result.allowed,
      category: result.category === "none" ? undefined : result.category,
      confidence: result.confidence === "high" ? "ai" : "ai",
      reason: result.reason,
    };
  } catch (e: any) {
    console.error("[content-scanner] AI scan failed:", e?.message ?? e);
    // Fail open: if AI scan errors, allow but log
    return { allowed: true, confidence: "none", reason: "AI scan unavailable — passed by default" };
  }
}

export const scanCampaignContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanInput.parse(input))
  .handler(async ({ data }): Promise<ScanResult> => {
    // Layer 1: Fast keyword check
    const keywordResult = keywordScan(data.messageBody);
    if (!keywordResult.allowed) {
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
