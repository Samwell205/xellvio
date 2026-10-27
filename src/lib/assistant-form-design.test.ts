import { describe, expect, it } from "vitest";
import { designFormSchema, DEFAULT_FORM_CONSENT } from "./account-assistant.schemas";

const base = {
  name: "Interest list",
  headline: "Join the interest list",
  ctaLabel: "Yes, I'm interested!",
  successMessage: "You are on the list!",
  accent: "#7C3AED",
};

describe("assistant form design proposals", () => {
  it("accepts a complete new-form design with defaults", () => {
    const parsed = designFormSchema.parse(base);
    expect(parsed.theme).toBe("light");
    expect(parsed.collectName).toBe(true);
    expect(parsed.consentText).toBe(DEFAULT_FORM_CONSENT);
    expect(parsed.formId ?? null).toBeNull();
  });

  it("defaults consent text when omitted and rejects blank consent", () => {
    const parsed = designFormSchema.parse(base);
    expect(parsed.consentText).toBe(DEFAULT_FORM_CONSENT);
    expect(designFormSchema.safeParse({ ...base, consentText: "  " }).success).toBe(false);
  });

  it.each(["purple", "7C3AED", "#12345", "rgb(1,2,3)"])("rejects non-hex accent %s", accent => {
    expect(designFormSchema.safeParse({ ...base, accent }).success).toBe(false);
  });

  it("accepts restyling an existing form by id", () => {
    const parsed = designFormSchema.parse({
      ...base,
      formId: "11111111-1111-4111-8111-111111111111",
      theme: "dark",
    });
    expect(parsed.formId).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.theme).toBe("dark");
  });

  it("rejects a missing headline or button label", () => {
    expect(designFormSchema.safeParse({ ...base, headline: "" }).success).toBe(false);
    expect(designFormSchema.safeParse({ ...base, ctaLabel: "" }).success).toBe(false);
  });
});
