import { describe, it, expect } from "vitest";
import { aiUnavailableFallback } from "./ai-unavailable-fallback";

describe("aiUnavailableFallback", () => {
  it("lets a plain Hello send when AI is down", () => {
    expect(aiUnavailableFallback("Hello\nReply STOP to unsubscribe").risky).toBe(false);
  });
  it("holds messages with a link", () => {
    expect(aiUnavailableFallback("Update here https://example.com STOP").risky).toBe(true);
  });
  it("holds messages with a phone number", () => {
    expect(aiUnavailableFallback("Call +44 7401 028795 now").risky).toBe(true);
  });
});
