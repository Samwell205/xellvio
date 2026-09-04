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
  prompt: z.string().trim().max(4000).default(""),
  blocks: z.array(z.any()).max(300).default([]),
  theme: z.record(z.string(), z.any()).default({}),
  focusId: z.string().max(60).optional(),
  focusLabel: z.string().max(60).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(12)
    .default([]),
});

const SCHEMA_DOC = `
Design JSON schema (all designs are trees of blocks):

Block = {
  "id": string (optional; omit for new blocks),
  "type": one of
     structure: "section" | "columns" | "column" | "form"
     content:   "heading" | "text" | "image" | "logo" | "icon" | "divider" | "spacer" | "video" | "html" | "social" | "button" | "submit"
     fields:    "field"
     marketing: "features" | "testimonials" | "pricing" | "faq" | "stats" | "countdown",
  "content": object (see below),
  "styles": object (see below),
  "children": Block[]  (only for section, columns, column, form)
}

content by type:
 heading  { text, level: 1|2|3 }
 text     { text }
 image/logo { url, alt }
 icon     { glyph }           e.g. "⚡"
 video    { url }
 html     { html }
 social   { items: [{label,url}] }
 button   { label, url }
 submit   { label }
 field    { kind, label, placeholder, required, help, options: string[] }
          kind: firstName|lastName|fullName|email|phone|company|website|address|city|state|country|date|number|select|checkbox|radio|textarea|hidden
 form     { successMessage, successMode: "message"|"redirect", redirectUrl, consentText }
 features { items: [{icon,title,body}] }
 testimonials { items: [{quote,author,role}] }
 pricing  { items: [{name,price,period,features:string[],cta,featured}] }
 faq      { items: [{q,a}] }
 stats    { items: [{value,label}] }
 countdown { label, endsAt (ISO date) }

styles (all optional): align("left"|"center"|"right"), fontSize, mobileFontSize, fontWeight,
 lineHeight, letterSpacing, textTransform("none"|"uppercase"), color, background,
 backgroundImage, paddingY, paddingX, marginTop, marginBottom, radius, borderWidth,
 borderColor, shadow(bool), width("auto"|"full"), maxWidth, columns, mobileColumns, gap,
 minHeight, hideOnMobile(bool), opacity,
 animation("none"|"fadeIn"|"fadeUp"|"fadeDown"|"fadeLeft"|"fadeRight"|"zoomIn"|"popIn"|"blurIn"|"flipIn"|"tiltIn"|"riseIn"),
 animationDelay(ms), animationDuration(ms),
 hoverEffect("none"|"lift"|"grow"|"sink"|"glow"|"tilt3d"|"shine"),
 depth("none"|"soft"|"raised"|"floating"|"glass"), overlay(0-90 image tint %),
 backgroundBlend("none"|"overlay"|"multiply"|"screen"|"soft-light"), parallax(bool), sticky(bool), rotate(deg), tilt(bool).
color/background may be a hex value OR a theme token:
 "primary" | "primaryText" | "secondary" | "background" | "surface" | "text" | "heading" | "muted" | "border" | "transparent".

theme = { primary, primaryText, secondary, background, surface, text, heading, muted, border,
 headingFont, bodyFont ("sans"|"grotesk"|"serif"|"slab"|"rounded"|"mono"), baseFontSize,
 radius, inputRadius, buttonRadius, spacing, shadow(bool),
 buttonStyle("solid"|"outline"|"pill"|"soft"), maxWidth }

Rules:
- Top level must be "section" blocks only. Put content inside sections.
- Every sign-up experience needs exactly one "form" block containing "field" blocks and one "submit" block. Always include a phone field (this platform sends SMS).
- Reuse existing "id" values for blocks you keep unchanged so the user's selection and edits survive.
- Professional marketing design: clear hierarchy, generous spacing (section paddingY 64–96),
  one obvious CTA, high contrast, no clutter, mobileColumns 1 for multi-column layouts.
- Never output HTML for layout; use blocks.
- Motion should feel premium and restrained: entrance animations on sections/headlines with staggered animationDelay (0/80/160ms), hoverEffect on buttons and cards, depth for cards. Never animate every element.
`;

function systemPrompt(kind: "form" | "page") {
  return `You are Xellvio's senior product designer and conversion copywriter. You design ${
    kind === "form" ? "SMS sign-up forms" : "marketing landing pages"
  } as structured JSON.

${SCHEMA_DOC}

Respond with ONLY minified JSON in this exact shape:
{"blocks":[...],"theme":{...},"summary":["short change 1","short change 2"]}
"theme" may be omitted when unchanged. "summary" is 1-6 plain-English bullet points describing what you changed. No markdown, no commentary, no code fences.`;
}

const MODE_INSTRUCTIONS: Record<string, string> = {
  create: "Create a complete, polished design from the user's description.",
  improve: "Improve the current design without changing its core message or fields.",
  professional: "Raise the design quality: typography, spacing, hierarchy and colour consistency. Keep the content.",
  convert: "Optimise for conversions: sharpen the headline, tighten copy, strengthen the CTA, reduce friction in the form.",
  mobile: "Optimise the design for mobile: single-column layouts, smaller heading sizes via mobileFontSize, tighter padding, full-width buttons.",
  simplify: "Simplify: remove non-essential elements and decoration, keep the core message and form.",
  copy: "Rewrite only the copy (headings, paragraphs, CTA labels) to be sharper and more persuasive. Keep structure and styles.",
  brand: "Apply the brand described by the user consistently across theme and blocks.",
  animate: "Add tasteful motion and depth: staggered entrance animations on key sections, hover effects on buttons and cards, subtle depth on cards. Do not change copy or structure.",
  edit: "Make exactly the change the user asked for and nothing else. Keep every other block, id, style and word identical.",
};

function extractJson(raw: string): any {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI reply could not be read. Please try again.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export const generateBuilderDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { getChatModel } = await import("./ai-provider.server");
    const model = await getChatModel();
    if (!model) throw new Error("The AI design assistant is not configured yet.");
    const { generateText } = await import("ai");

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

    const { text } = await generateText({
      model,
      system: systemPrompt(data.kind),
      prompt: userPrompt,
      temperature: 0.4,
      maxOutputTokens: 8000,
    });

    const parsed = extractJson(text);
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    if (blocks.length === 0) throw new Error("The AI did not return a design. Try describing it again.");
    const summary: string[] = Array.isArray(parsed?.summary)
      ? parsed.summary.filter((s: unknown) => typeof s === "string").slice(0, 8)
      : [];
    return {
      blocks,
      theme: parsed?.theme && typeof parsed.theme === "object" ? parsed.theme : null,
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
