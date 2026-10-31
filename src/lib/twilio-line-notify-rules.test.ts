import { describe, it, expect } from "vitest";
import { tollfreeEmailFor } from "./twilio-line-notify-rules";

describe("toll-free status emails", () => {
  it("emails on submission", () => expect(tollfreeEmailFor("verification_pending", null)).toBe("tollfree-submitted"));
  it("emails on approval", () => expect(tollfreeEmailFor("active", "verification_pending")).toBe("tollfree-approved"));
  it("emails on rejection", () => expect(tollfreeEmailFor("rejected", "verification_pending")).toBe("tollfree-rejected"));
  it("never repeats the same status", () => expect(tollfreeEmailFor("active", "active")).toBeNull());
  it("ignores setup steps", () => expect(tollfreeEmailFor("number_purchased", null)).toBeNull());
});
