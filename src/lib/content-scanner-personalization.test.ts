import { describe, it, expect } from "vitest";
import { isPersonalizationOnlyBlock } from "./content-scanner";

describe("personalization-only keyword hits", () => {
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