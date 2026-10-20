import { z } from "zod";

export const ASSISTED_NUMBER_FEE_USD = 100;
export const ASSISTED_NUMBER_TARGET_HOURS = 24;
export const assistedRequestSchema = z.object({
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((v) => v.toUpperCase()),
  numberType: z.enum(["mobile", "local", "national", "toll-free"]),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{6,14}$/),
  purpose: z.string().trim().min(10).max(2000),
  confirmed: z.literal(true),
});

export function canCompleteAssistedRequest(requested: string, assigned: string | null, status: string) {
  return requested === assigned && status === "verified";
}