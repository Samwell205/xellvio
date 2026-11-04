import { describe, expect, it } from "vitest";
import { parseVerifierRegistration, readVerifierRegistration, verifierUseCaseCategories } from "./verifier-registration";

export const registration = {
  legalEntityName: "Example Business", businessDba: "Example", websiteUrl: "https://example.com",
  businessType: "Private company / LLC / Partnership", businessRegistrationNumber: "12-3456789",
  businessRegistrationIdentifier: "EIN", businessRegistrationCountry: "US",
  contactFirstName: "Test", contactLastName: "Owner", contactEmail: "owner@example.com", contactPhoneCountry: "+1", contactPhone: "5551234567",
  businessCountry: "US", addressLine1: "123 Main St", city: "New York", state: "NY", zip: "10001", monthlyVolume: "10000",
  optInType: "WEB_FORM", useCaseCategories: ["General Marketing"], proofOfOptInUrl: "https://example.com/optin.png",
  proofShowsRequiredConsent: true, useCaseDescription: "Customers explicitly opt in on our website to receive marketing updates.",
  sampleMessage: "Example Business: Your appointment is tomorrow. Reply STOP to opt out.",
  notificationEmail: "owner@example.com", additionalInformation: "Only explicitly opted-in contacts receive updates.",
  optInConfirmationMessage: "Example: Welcome. Reply STOP to cancel.", helpMessageSample: "Example: Contact owner@example.com for help.",
  privacyPolicyUrl: "https://example.com/privacy", termsUrl: "https://example.com/terms", optInKeywords: "START, YES, SUBSCRIBE",
  containsAgeGatedContent: false, agreeToTos: true,
};

describe("verifier registration", () => {
  it("keeps complete business/contact/opt-in details and normalizes saved volume", () => {
    expect(parseVerifierRegistration(registration)).toMatchObject({ ...registration, monthlyVolume: "10,000" });
  });
  it("requires details rather than accepting empty submission or arbitrary notes", () => {
    expect(() => readVerifierRegistration(undefined)).toThrow();
    expect(() => readVerifierRegistration(undefined, "please verify")).toThrow();
    expect(readVerifierRegistration(undefined, JSON.stringify(registration)).monthlyVolume).toBe("10,000");
  });
  it.each(["proofShowsRequiredConsent", "agreeToTos"])("requires explicit %s", (field) => {
    expect(() => parseVerifierRegistration({ ...registration, [field]: false })).toThrow();
    expect(() => parseVerifierRegistration({ ...registration, [field]: undefined })).toThrow();
  });
  it.each(["proofOfOptInUrl", "privacyPolicyUrl", "termsUrl"])("requires public HTTPS %s", (field) => {
    expect(() => parseVerifierRegistration({ ...registration, [field]: "http://example.com/proof" })).toThrow();
    expect(() => parseVerifierRegistration({ ...registration, [field]: "" })).toThrow();
  });
  it("uses shared STOP, sample length and contact phone checks", () => {
    expect(() => parseVerifierRegistration({ ...registration, sampleMessage: "Example: Your appointment is tomorrow." })).toThrow();
    expect(() => parseVerifierRegistration({ ...registration, sampleMessage: "STOP " + "a".repeat(316) })).toThrow();
    expect(() => parseVerifierRegistration({ ...registration, contactPhone: "123" })).toThrow();
  });
  it("maps default General Marketing and saved legacy values to valid categories", () => {
    expect(verifierUseCaseCategories(["General Marketing", "MARKETING", "App Notifications"])).toEqual(["MARKETING", "ACCOUNT_NOTIFICATIONS"]);
    expect(verifierUseCaseCategories(["2FA", "Courier Services & Deliveries"])).toEqual(["TWO_FACTOR_AUTHENTICATION", "DELIVERY_NOTIFICATIONS"]);
  });
  it("does not silently invent categories for unsupported or political submissions", () => {
    expect(() => verifierUseCaseCategories(["invalid"])).toThrow();
    expect(() => verifierUseCaseCategories(["Mixed"])).toThrow();
    expect(() => verifierUseCaseCategories(["Political"])).toThrow();
  });
  it("rejects the unsupported 5,000,000+ volume without changing the estimate", () => {
    expect(() => parseVerifierRegistration({ ...registration, monthlyVolume: "5,000,000+" })).toThrow();
  });
});