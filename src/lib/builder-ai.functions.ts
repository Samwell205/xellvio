/**
 * AI design assistant. Returns structured block JSON (never markup) so every
 * AI-generated design stays fully editable inside the visual builder.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  kind: z.enum(["form", "page"]),
  mode: z
    .enum(["create", "improve", "professional", "convert", "mobile", "simplify", "copy", "brand", "animate", "edit"])
    .default("create"),
  prompt: z.string().trim().max(24000).default(""),
  blocks: z.array(z.any()).max(300).default([]),
  theme: z.record(z.string(), z.any()).default({}),
  focusId: z.string().max(60).optional(),
  focusLabel: z.string().max(60).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
    .max(12)
    .default([]),
});

import { MODE_INSTRUCTIONS, extractJson, systemPrompt } from "./builder/design-prompt";


export const generateBuilderDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { runDesignModel } = await import("./ai-designer.server");

    const current = JSON.stringify({ theme: data.theme, blocks: data.blocks }).slice(0, 60_000);
    const hasDesign = Array.isArray(data.blocks) && data.blocks.length > 0;

    const conversation = data.history.map((h) => `${h.role === "user" ? "User" : "You"}: ${h.text}`).join("\n");

    const userPrompt = [
      MODE_INSTRUCTIONS[data.mode] ?? MODE_INSTRUCTIONS.create,
      hasDesign ? `Current design JSON:\n${current}` : "There is no design yet — build one from scratch.",
      conversation ? `Recent conversation:\n${conversation}` : "",
      data.focusId
        ? `The user has selected the "${data.focusLabel ?? "element"}" block with id "${data.focusId}". Focus your change on that block and its children unless the request clearly concerns the whole design.`
        : "",
      data.prompt ? `User request: ${data.prompt}` : "",
      hasDesign
        ? "Return the COMPLETE updated design (all blocks), modifying only what the request needs and keeping existing ids for untouched blocks."
        : "Return the complete new design.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const text = await runDesignModel(systemPrompt(data.kind), userPrompt);

    const parsed = extractJson(text);
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    if (blocks.length === 0) throw new Error("The AI did not return a design. Try describing it again.");
    const summary: string[] = Array.isArray(parsed?.summary)
      ? parsed.summary.filter((s: unknown) => typeof s === "string").slice(0, 8)
      : [];
    const seoTitle = typeof parsed?.seo?.title === "string" ? parsed.seo.title.trim().slice(0, 70) : "";
    const seoDescription =
      typeof parsed?.seo?.description === "string" ? parsed.seo.description.trim().slice(0, 200) : "";
    return {
      blocks,
      theme: parsed?.theme && typeof parsed.theme === "object" ? parsed.theme : null,
      seo: seoTitle || seoDescription ? { title: seoTitle, description: seoDescription } : null,
      summary: summary.length ? summary : ["Updated the design"],
    };
  });

/* --------------------------- single-element copy help ------------------------- */

const TextInput = z.object({
  text: z.string().trim().max(1000).default(""),
  action: z.enum(["improve", "shorter", "persuasive", "professional", "alternatives", "cta", "headline", "subheadline"]),
  context: z.string().trim().max(1500).default(""),
});

export const generateBuilderCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TextInput.parse(input))
  .handler(async ({ data }) => {
    const { getChatModel } = await import("./ai-provider.server");
    const model = await getChatModel();
    if (!model) throw new Error("The AI assistant is not configured yet.");
    const { generateText } = await import("ai");

    const asks: Record<string, string> = {
      improve: "Rewrite it so it reads better and lands harder.",
      shorter: "Make it noticeably shorter without losing the point.",
      persuasive: "Make it more persuasive, benefit-led and specific.",
      professional: "Make it sound polished and professional.",
      alternatives: "Give 3 strong alternatives.",
      cta: "Write 3 short, action-led button labels.",
      headline: "Write 3 strong marketing headlines.",
      subheadline: "Write 3 supporting subheadlines, one sentence each.",
    };

    const { text } = await generateText({
      model,
      system:
        "You are a senior direct-response copywriter for SMS marketing. Reply with ONLY a JSON array of strings (1 item unless alternatives were asked for). No markdown, no commentary.",
      prompt: `Current text: ${data.text || "(empty)"}\nPage context: ${data.context || "(none)"}\nTask: ${asks[data.action]}`,
      temperature: 0.7,
      maxOutputTokens: 600,
    });

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    try {
      const arr = JSON.parse(cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1));
      const options = (Array.isArray(arr) ? arr : []).filter((s: unknown) => typeof s === "string").slice(0, 5);
      if (options.length) return { options };
    } catch {
      /* fall through */
    }
    return { options: [cleaned.replace(/^["']|["']$/g, "").slice(0, 400)] };
  });
