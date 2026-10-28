import { describe, it, expect } from "vitest";
import { aiUnavailableFallback } from "./ai-unavailable-fallback";

describe("aiUnavailableFallback", () => {
  it("lets a plain Hello send when AI is down", () => {
    expect(aiUnavailableFallback("Hello\nReply STOP to unsubscribe").risky).toBe(false);
  });
  it("does not hold link messages for admin approval when AI is down", () => {
    const d = aiUnavailableFallback("Update here https://example.com STOP");
    expect(d.risky).toBe(false);
    expect(d.score).toBe(0);
  });
});
