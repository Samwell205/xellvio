import { describe, expect, it } from "vitest";
import { withSmsOptOut } from "./sms-optout";
describe("exact SMS opt-out wording", () => {
  it("preserves Reply STOP to opt out", () => expect(withSmsOptOut("Sale today. Reply STOP to opt out")).toBe("Sale today. Reply STOP to opt out"));
  it("preserves Reply STOP to end", () => expect(withSmsOptOut("Sale today. Reply STOP to end")).toBe("Sale today. Reply STOP to end"));
  it("preserves standalone STOP", () => expect(withSmsOptOut("Sale today. STOP")).toBe("Sale today. STOP"));
  it("adds footer only when STOP is absent", () => expect(withSmsOptOut("Sale today.")).toBe("Sale today.\nReply STOP to unsubscribe."));
  it("does not treat nonstop as an opt-out", () => expect(withSmsOptOut("Nonstop offers")).toBe("Nonstop offers\nReply STOP to unsubscribe."));
});