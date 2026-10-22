import { describe, expect, it } from "vitest";
import { canConfirmAssistantCampaign } from "./assistant-campaign-policy";
describe("in-chat campaign confirmation", () => {
  it("allows an explicitly skipped test with final consent", () => {
    expect(canConfirmAssistantCampaign({ choice: "skipped", consent: true, blocked: false })).toBe(
      true,
    );
  });
  it("allows a successful test with final consent", () => {
    expect(canConfirmAssistantCampaign({ choice: "tested", consent: true, blocked: false })).toBe(
      true,
    );
  });
  it("requires an explicit test choice", () => {
    expect(canConfirmAssistantCampaign({ choice: "none", consent: true, blocked: false })).toBe(
      false,
    );
  });
  it("requires final consent even when skipping", () => {
    expect(canConfirmAssistantCampaign({ choice: "skipped", consent: false, blocked: false })).toBe(
      false,
    );
  });
  it("never skips other sending checks", () => {
    expect(canConfirmAssistantCampaign({ choice: "skipped", consent: true, blocked: true })).toBe(
      false,
    );
  });
});
