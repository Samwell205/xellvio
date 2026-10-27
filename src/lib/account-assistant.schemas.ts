import { z } from "zod";
export const draftCampaignSchema = z.object({ name: z.string().trim().min(1).max(120), body: z.string().min(1).max(1600), listId: z.string().uuid() });
export const draftAgentSchema = z.object({ name: z.string().trim().min(1).max(120), instructions: z.string().min(1).max(4000), businessInformation: z.string().max(12000), greeting: z.string().max(1000) });
export const inspectFileSchema = z.object({ name: z.string().trim().min(1).max(120), content: z.string().min(1).max(2_000_000), defaultCountry: z.string().regex(/^[A-Z]{2}$/).or(z.literal("")) });
export const DEFAULT_FORM_CONSENT = "By signing up, you agree to receive text messages from us. Reply STOP to opt out.";
export const designFormSchema = z.object({
  formId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(120),
  eyebrow: z.string().trim().max(60).nullish(),
  headline: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).default(""),
  ctaLabel: z.string().trim().min(1).max(40),
  successMessage: z.string().trim().min(1).max(200),
  collectName: z.boolean().default(true),
  theme: z.enum(["light", "dark"]).default("light"),
  accent: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex color like #7C3AED"),
  consentText: z.string().trim().min(1).max(400).default(DEFAULT_FORM_CONSENT),
  listId: z.string().uuid().nullish(),
});