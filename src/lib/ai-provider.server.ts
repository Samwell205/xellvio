/**
 * Provider-agnostic AI model factory.
 *
 * Uses Anthropic Claude directly when ANTHROPIC_API_KEY is set (self-hosted
 * setup); otherwise falls back to the managed Lovable AI Gateway so the app
 * keeps working inside the Lovable preview.
 */
import type { LanguageModel } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const GATEWAY_FALLBACK_MODEL = "google/gemini-3-flash-preview";

export function aiProvider(): "anthropic" | "lovable" | "none" {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.LOVABLE_API_KEY) return "lovable";
  return "none";
}

/**
 * Returns a configured chat model, or null when no AI provider is configured.
 */
export async function getChatModel(): Promise<LanguageModel | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic(CLAUDE_MODEL);
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    const gateway = createLovableAiGatewayProvider(lovableKey);
    return gateway(GATEWAY_FALLBACK_MODEL);
  }

  return null;
}

/** Gateway model used as a backup when the primary provider fails. */
export function getGatewayModel(): LanguageModel | null {
  const key = process.env.LOVABLE_API_KEY;
  return key ? createLovableAiGatewayProvider(key)(GATEWAY_FALLBACK_MODEL) : null;
}

/** Generate text with the primary model; on failure retry once on the gateway. */
export async function generateWithFallback(args: Record<string, unknown>): Promise<string> {
  const { generateText } = await import("ai");
  const primary = await getChatModel();
  if (!primary) throw new Error("AI is not configured");
  try {
    const r = await generateText({ ...(args as any), model: primary });
    return r.text;
  } catch (e) {
    console.error("[ai] primary model failed", e instanceof Error ? e.message : e);
    const backup = aiProvider() === "anthropic" ? getGatewayModel() : null;
    if (!backup) throw e;
    const r = await generateText({ ...(args as any), model: backup });
    return r.text;
  }
}
