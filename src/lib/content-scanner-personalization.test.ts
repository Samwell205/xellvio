import { describe, it, expect } from "vitest";
import { isPersonalizationOnlyBlock, personalizationPlanningPatch } from "./content-scanner";

describe("personalization-only keyword hits", () => {
  it("excludes restricted personalisation from paid queued claims", () => {
    expect(personalizationPlanningPatch("{{first_name}}: Hi STOP", "Concealed Carry Handgun Training: Hi STOP")?.status).toBe("skipped");
    expect(personalizationPlanningPatch("{{first_name}}: Hi STOP", "Sam: Hi STOP")).toBeNull();
  });
  it("skips only the recipient whose name contains restricted wording", () => {
    expect(isPersonalizationOnlyBlock(
      "{{first_name}}: Your order update is ready. STOP",
      "Daniel Matthews' Concealed Carry Handgun Training: Your order update is ready. STOP",
    )).toBe(true);
  });
  it("does not treat a prohibited template as a personalization issue", () => {
    expect(isPersonalizationOnlyBlock(
      "{{first_name}}: Buy guns today. STOP",
      "Sam: Buy guns today. STOP",
    )).toBe(false);
  });
  it("leaves clean messages alone", () => {
    expect(isPersonalizationOnlyBlock("{{first_name}}: Hi", "Sam: Hi")).toBe(false);
  });
});