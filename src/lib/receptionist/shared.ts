import { z } from "zod";

export const receptionistConfigSchema = z.object({
  businessName: z.string().trim().max(120).default(""),
  greeting: z.string().trim().max(1000).default(""),
  businessInformation: z.string().trim().max(12000).default(""),
  phoneMode: z.enum(["forwarding", "dedicated"]).default("forwarding"),
  handoffNumber: z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{6,14}$/)]).default(""),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Choose a valid timezone").default("America/New_York"),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("17:00"),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  appointmentMinutes: z.number().int().min(10).max(180).default(30),
  bufferMinutes: z.number().int().min(0).max(60).default(10),
  calendarId: z.string().max(256).default(""),
  bookingLink: z.union([z.literal(""), z.string().url().max(1000).refine(value => value.startsWith("https://"), "Use a secure booking link")]).default(""),
  smsFollowUp: z.boolean().default(false),
  smsText: z.string().trim().max(1200).default(""),
  notifyEmail: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  retainTranscript: z.boolean().default(false),
}).refine(c => c.closeTime > c.openTime, { message: "Closing time must be later than opening time", path: ["closeTime"] });
export type ReceptionistConfig = z.infer<typeof receptionistConfigSchema>;
export function defaultReceptionistConfig(): ReceptionistConfig { return receptionistConfigSchema.parse({}); }

export function canActivateReceptionist(input: { pricingApproved: boolean; voiceVerified: boolean; numberAssigned: boolean; testVerified: boolean; businessReady: boolean }): boolean {
  return input.pricingApproved && input.voiceVerified && input.numberAssigned && input.testVerified && input.businessReady;
}
export function canFollowUp(input: { enabled: boolean; consent: boolean; consentEvidence: string | null; suppressed: boolean }): boolean {
  return input.enabled && input.consent && Boolean(input.consentEvidence?.trim()) && !input.suppressed;
}
export function isWithinBusinessHours(start: string, end: string, config: ReceptionistConfig): boolean {
  const parts = (value: string) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const get = (key: string) => p.find(x => x.type === key)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}`, day: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(get("weekday")) };
  };
  const a = parts(start), b = parts(end);
  return a.date === b.date && config.weekdays.includes(a.day) && a.time >= config.openTime && b.time <= config.closeTime;
}
export function intervalsOverlap(a: string, b: string, c: string, d: string) { return Date.parse(a) < Date.parse(d) && Date.parse(c) < Date.parse(b); }
export const appointmentInputSchema = z.object({
  name: z.string().trim().min(1).max(120), phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  email: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  startsAt: z.string().datetime({ offset: true }), confirmed: z.literal(true), idempotencyKey: z.string().uuid(),
});