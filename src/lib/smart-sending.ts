import { z } from "zod";

export const SmartSendingSettingsSchema = z.object({
  enabled: z.boolean(),
  hours: z.number().int().min(1).max(8760),
});
export const SMART_SENDING_WINDOWS = [
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "2 days" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
];
export function resolveSmartSending(defaults: { enabled: boolean; hours: number }, mode: "inherit" | "on" | "off", hours: number) {
  return { enabled: mode === "inherit" ? defaults.enabled : mode === "on", hours: mode === "inherit" ? defaults.hours : hours };
}