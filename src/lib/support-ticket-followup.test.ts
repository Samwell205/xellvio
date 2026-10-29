import { describe, expect, it } from "vitest";
import { followupAction } from "./support-ticket-followup";

const H = 3600_000;
const t0 = 1_000_000_000_000;

describe("support ticket follow-ups", () => {
  it("does nothing before 3 hours", () => {
    expect(followupAction(t0, null, t0 + 2.9 * H)).toBe("none");
  });
  it("sends the first reminder after 3 hours", () => {
    expect(followupAction(t0, null, t0 + 3 * H)).toBe("reminder1");
  });
  it("sends the second reminder after 6 hours", () => {
    expect(followupAction(t0, t0 + 3 * H, t0 + 6 * H)).toBe("reminder2");
  });
  it("does not repeat the second reminder", () => {
    expect(followupAction(t0, t0 + 6 * H, t0 + 7 * H)).toBe("none");
  });
  it("closes after 9 hours without a reply", () => {
    expect(followupAction(t0, t0 + 6 * H, t0 + 9 * H)).toBe("close");
  });
  it("ignores a reminder from before the latest support reply", () => {
    expect(followupAction(t0, t0 - 5 * H, t0 + 3 * H)).toBe("reminder1");
  });
});
