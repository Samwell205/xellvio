import { describe, it, expect } from "vitest";
import { MESSAGE, SEGMENTS, ESTIMATED_COST, SENT, DEMO } from "./demo-fixture";

describe("homepage demo fixture", () => {
  it("message stays one GSM segment", () => {
    expect(SEGMENTS.encoding).toBe("GSM-7");
    expect(SEGMENTS.segments).toBe(1);
    expect(SEGMENTS.charCount).toBe(MESSAGE.length);
  });
  it("estimate uses $16.50 per 1,000 US segments", () => {
    expect(ESTIMATED_COST).toBeCloseTo(1248 * 0.0165, 6);
  });
  it("report statuses add up to the audience", () => {
    expect(SENT).toBe(DEMO.audience.size);
  });
});
