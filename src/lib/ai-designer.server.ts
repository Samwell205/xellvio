/**
 * Server-only AI designer shared by the visual builder and the account
 * assistant. Text designs use OpenAI through the AI gateway (streamed), and
 * pictures referenced as {{HERO_IMAGE}} / {{SECOND_IMAGE}} are generated and
 * stored in the business's private media library.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./account-ai-run-id.server.ts";
import { extractJson, systemPrompt } from "./builder/design-prompt";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const DESIGN_MODEL = "openai/gpt-6-astra";
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";

function apiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("The AI designer is not configured yet.");
  return key;
}

/** Streams a design request and returns the final text. */
export async function runDesignModel(system: string, prompt: string): Promise<string> {
  const key = apiKey();
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(DESIGN_MODEL),
    system,
    prompt,
    maxRetries: 0,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  if (!text.trim()) throw new Error("The AI designer returned nothing. Please try again.");
  return text;
}

async function generateImage(accountId: string, prompt: string, userId?: string): Promise<string | null> {
  try {
    const key = apiKey();
    const res = await fetch(`${GATEWAY}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: `${prompt}. High-end marketing photography or illustration, no text, no words, no logos.`,
        size: "1536x1024",
        quality: "medium",
      }),
    });
    if (!res.ok) {
      console.error("[designer] image failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const json: any = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) return null;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${accountId}/${crypto.randomUUID()}.png`;
    const up = await supabaseAdmin.storage.from("tenant-media").upload(path, bytes, { contentType: "image/png" });
    if (up.error) {
      console.error("[designer] image upload failed", up.error.message);
      return null;
    }
    const url = `/api/public/media/${path}`;
    await supabaseAdmin.from("media_assets").insert({
      account_id: accountId,
      name: "AI design picture.png",
      kind: "image",
      content_type: "image/png",
      size: bytes.length,
      storage_path: path,
      url,
      created_by: userId ?? null,
    } as never);
    return url;
  } catch (e) {
    console.error("[designer] image error", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Replaces picture placeholders with generated images (removed when generation fails). */
export async function fillDesignImages(
  accountId: string,
  blocks: unknown[],
  prompts: { hero?: string; second?: string } | undefined,
  fallbackTopic: string,
  userId?: string,
) {
  let json = JSON.stringify(blocks);
  const wanted = [
    ["{{HERO_IMAGE}}", prompts?.hero || fallbackTopic],
    ["{{SECOND_IMAGE}}", prompts?.second || fallbackTopic],
  ].filter(([tag]) => json.includes(tag));
  const urls = await Promise.all(wanted.map(([, p]) => generateImage(accountId, String(p).slice(0, 800), userId)));
  wanted.forEach(([tag], i) => {
    json = json.split(tag).join(urls[i] ?? "");
  });
  return JSON.parse(json) as any[];
}

/** Full design from a plain-language brief: blocks, theme and pictures. */
export async function designFromBrief(args: {
  kind: "form" | "page";
  brief: string;
  accountId: string;
  userId?: string;
}) {
  const text = await runDesignModel(
    systemPrompt(args.kind),
    `Create a complete, polished, creative design from this brief.\n\nBrief: ${args.brief}\n\nReturn the complete new design.`,
  );
  const parsed = extractJson(text);
  const raw = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  if (!raw.length) throw new Error("The AI designer did not return a design.");
  const blocks = await fillDesignImages(args.accountId, raw, parsed?.imagePrompts, args.brief, args.userId);
  return {
    blocks,
    theme: parsed?.theme && typeof parsed.theme === "object" ? parsed.theme : null,
    seo: parsed?.seo ?? null,
  };
}
