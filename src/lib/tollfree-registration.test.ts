import { describe, expect, it } from "vitest";
import { TOLLFREE_VOLUMES } from "./tollfree-use-cases";
import { dedicatedLineRegistrationSchema, normalizeTollfreeVolume, parseDedicatedLineRegistration, registrationPhone, tollfreePhoneSchema, tollfreeSampleSchema } from "./tollfree-registration";

const validRegistration = {
  businessName: "Example Business", website: "https://example.com", ein: "",
  street: "123 Main St", city: "New York", state: "NY", postalCode: "10001", country: "US",
  contactFirstName: "Test", contactLastName: "Owner", contactEmail: "owner@example.com", contactPhone: "+15551234567",
  privacyUrl: "https://example.com/privacy", termsUrl: "https://example.com/terms", optInImageUrl: "https://example.com/optin",
  useCaseSummary: "Appointment reminders sent to customers who explicitly opted in on our website.",
  sampleMessage: "Example Business: Your appointment is tomorrow. Reply STOP to opt out.", monthlyVolume: "10,000",
};

describe("toll-free registration validation", () => {
  it.each(TOLLFREE_VOLUMES)("accepts the wizard volume %s in a complete registration", (monthlyVolume) => {
    expect(dedicatedLineRegistrationSchema.parse({ ...validRegistration, monthlyVolume }).monthlyVolume).toBe(monthlyVolume);
  });
  it("restores saved numeric monthly volume 10000 as 10,000", () => {
    expect(normalizeTollfreeVolume(10000)).toBe("10,000");
    expect(dedicatedLineRegistrationSchema.parse({ ...validRegistration, monthlyVolume: "10000" }).monthlyVolume).toBe("10,000");
  });
  it("rejects values that are not a supported volume choice", () => {
    expect(dedicatedLineRegistrationSchema.safeParse({ ...validRegistration, monthlyVolume: "12345" }).success).toBe(false);
  });
  it("requires STOP instructions and rejects stop as part of another word", () => {
    expect(tollfreeSampleSchema.safeParse("Example Business: Your appointment is tomorrow.").success).toBe(false);
    expect(tollfreeSampleSchema.safeParse("Example Business: Visit our bus stop tomorrow.").success).toBe(true);
    expect(tollfreeSampleSchema.safeParse("Example Business: Nonstop appointment reminders.").success).toBe(false);
    expect(tollfreeSampleSchema.safeParse(validRegistration.sampleMessage).success).toBe(true);
  });
  it("enforces the same 20–320 sample length limits on both sides", () => {
    expect(tollfreeSampleSchema.safeParse("STOP " + "a".repeat(15)).success).toBe(true);
    expect(tollfreeSampleSchema.safeParse("STOP " + "a".repeat(315)).success).toBe(true);
    expect(tollfreeSampleSchema.safeParse("STOP " + "a".repeat(316)).success).toBe(false);
    expect(tollfreeSampleSchema.safeParse("STOP " + "a".repeat(14)).success).toBe(false);
  });
  it("checks 8–15 international digits after combining country code and phone", () => {
    expect(tollfreePhoneSchema.safeParse(registrationPhone("+1", "12345")).success).toBe(false);
    expect(tollfreePhoneSchema.safeParse("+12345678").success).toBe(true);
    expect(tollfreePhoneSchema.safeParse("+123456789012345").success).toBe(true);
    expect(tollfreePhoneSchema.safeParse("+1234567890123456").success).toBe(false);
    expect(registrationPhone("+44", "+1 (555) 123-4567")).toBe("+15551234567");
  });
  it("returns a readable field error before provisioning can be called", () => {
    expect(() => parseDedicatedLineRegistration({ ...validRegistration, sampleMessage: "Example Business: Your appointment is tomorrow." })).toThrow("Sample message: Add STOP opt-out instructions");
  });
});