import { describe, it, expect } from "vitest";
import { canActivateReceptionist, canFollowUp, defaultReceptionistConfig, intervalsOverlap, isWithinBusinessHours } from "./shared";

describe("receptionist safeguards", () => {
  it("does not activate paid calling before approved pricing", () => {
    expect(canActivateReceptionist({ pricingApproved: false, voiceVerified: true, numberAssigned: true, testVerified: true, businessReady: true })).toBe(false);
  });
  it("does not activate without a verified pilot call", () => {
    expect(canActivateReceptionist({ pricingApproved: true, voiceVerified: true, numberAssigned: true, testVerified: false, businessReady: true })).toBe(false);
  });
  it("requires affirmative SMS permission with evidence", () => {
    expect(canFollowUp({ enabled: true, consent: false, consentEvidence: "Caller called", suppressed: false })).toBe(false);
    expect(canFollowUp({ enabled: true, consent: true, consentEvidence: "Caller said yes to the requested text", suppressed: false })).toBe(true);
  });
  it("never follows up to an opted-out number", () => {
    expect(canFollowUp({ enabled: true, consent: true, consentEvidence: "yes", suppressed: true })).toBe(false);
  });
  it("keeps bookings inside local business hours through daylight saving", () => {
    const c = defaultReceptionistConfig();
    expect(isWithinBusinessHours("2026-10-21T13:00:00Z", "2026-10-21T13:30:00Z", c)).toBe(true);
    expect(isWithinBusinessHours("2026-11-04T14:00:00Z", "2026-11-04T14:30:00Z", c)).toBe(true);
    expect(isWithinBusinessHours("2026-11-04T13:00:00Z", "2026-11-04T13:30:00Z", c)).toBe(false);
  });
  it("disallows weekend appointments and overlapping intervals", () => {
    expect(isWithinBusinessHours("2026-10-24T14:00:00Z", "2026-10-24T14:30:00Z", defaultReceptionistConfig())).toBe(false);
    expect(intervalsOverlap("2026-10-21T13:00Z", "2026-10-21T14:00Z", "2026-10-21T13:30Z", "2026-10-21T14:30Z")).toBe(true);
    expect(intervalsOverlap("2026-10-21T13:00Z", "2026-10-21T14:00Z", "2026-10-21T14:00Z", "2026-10-21T14:30Z")).toBe(false);
  });
});
import { describe as d2, it as i2, expect as e2 } from "vitest";
import { buildInstructions } from "./provision.server";
d2("receptionist agent instructions", () => {
  i2("names the business and forbids invented bookings", () => {
    const t = buildInstructions({ ...defaultReceptionistConfig(), businessName: "Acme Plumbing", businessInformation: "Boiler repairs", calendarId: "primary" });
    e2(t).toContain("Acme Plumbing");
    e2(t).toContain("Only say an appointment is booked after the booking tool confirms it.");
  });
  i2("follows the business's own instructions and does not book without a calendar", () => {
    const t = buildInstructions({ ...defaultReceptionistConfig(), businessName: "Cafe", agentInstructions: "Take catering orders" });
    e2(t).toContain("Take catering orders");
    e2(t).toContain("Do not book appointments");
  });
});

import { describe as d3, it as i3, expect as e3 } from "vitest";
import { textingPath } from "./shared";
d3("texting readiness follows carrier rules", () => {
  i3("US toll-free needs toll-free verification", () => e3(textingPath("US", "toll-free", true)).toBe("tollfree_verification"));
  i3("US local needs 10DLC registration", () => e3(textingPath("US", "local", true)).toBe("tendlc_registration"));
  i3("UK mobile texts once active", () => e3(textingPath("GB", "mobile", true)).toBe("ready"));
  i3("calls-only numbers never text", () => e3(textingPath("GB", "toll-free", false)).toBe("calls_only"));
});
