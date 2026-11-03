import { describe, it, expect } from "vitest";
import { resolveSmartSending, SmartSendingSettingsSchema, SMART_SENDING_WINDOWS } from "./smart-sending";
describe("Smart Sending controls", () => {
  it("offers 24 hours, 2 days, 7 days and 30 days", () => expect(SMART_SENDING_WINDOWS.map(w => w.hours)).toEqual([24, 48, 168, 720]));
  it("inherits the business window", () => expect(resolveSmartSending({ enabled: true, hours: 168 }, "inherit", 24)).toEqual({ enabled: true, hours: 168 }));
  it("can turn off for a campaign", () => expect(resolveSmartSending({ enabled: true, hours: 24 }, "off", 48).enabled).toBe(false));
  it("can turn on for a campaign with its own window", () => expect(resolveSmartSending({ enabled: false, hours: 24 }, "on", 720)).toEqual({ enabled: true, hours: 720 }));
  it("accepts a custom 72-hour window", () => expect(SmartSendingSettingsSchema.parse({ enabled: true, hours: 72 }).hours).toBe(72));
  it("rejects zero hours", () => expect(SmartSendingSettingsSchema.safeParse({ enabled: true, hours: 0 }).success).toBe(false));
});