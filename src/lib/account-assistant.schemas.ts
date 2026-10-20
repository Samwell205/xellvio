import { z } from "zod";
export const draftCampaignSchema = z.object({ name: z.string().trim().min(1).max(120), body: z.string().min(1).max(1600), listId: z.string().uuid() });
export const draftAgentSchema = z.object({ name: z.string().trim().min(1).max(120), instructions: z.string().min(1).max(4000), businessInformation: z.string().max(12000), greeting: z.string().max(1000) });
export const inspectFileSchema = z.object({ name: z.string().trim().min(1).max(120), content: z.string().min(1).max(2_000_000), defaultCountry: z.string().regex(/^[A-Z]{2}$/).or(z.literal("")) });