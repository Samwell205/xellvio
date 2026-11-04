import { describe, expect, it } from "vitest";
import { fallBackFromOwnLine, mapVerification, ownLineApplies } from "./twilio-lines-rules";
describe("dedicated line routing", () => {
  it("own line for US/Canada text and picture messages", () => {
    expect(ownLineApplies("+17049286912", false)).toBe(true);
    expect(ownLineApplies("+447542683958", false)).toBe(false);
    // Media must ride the business's own line too: the shared route cannot
    // send from that number and rejects it as an invalid source.
    expect(ownLineApplies("+17049286912", true)).toBe(true);
    expect(ownLineApplies("+447542683958", true)).toBe(false);
  });
  it("falls back only on explicit refusal, never timeout or STOP", () => {
    expect(fallBackFromOwnLine({ lineStatus: 400, lineCode: 30007 })).toBe(true);
    expect(fallBackFromOwnLine({})).toBe(false);
    expect(fallBackFromOwnLine({ lineStatus: 400, lineCode: 21610 })).toBe(false);
  });
  it("goes live only on approval", () => {
    expect(mapVerification("TWILIO_APPROVED")).toBe("active");
    expect(mapVerification("PENDING_REVIEW")).toBe("verification_pending");
    expect(mapVerification("TWILIO_REJECTED")).toBe("rejected");
  });
});
