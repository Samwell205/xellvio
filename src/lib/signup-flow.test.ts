import { describe, expect, it } from "vitest";
import { authCooldownSeconds, signupNeedsConfirmation } from "./signup-flow";

describe("signup confirmation and retry guards", () => {
  it("requires email confirmation when signup returns no session", () => {
    expect(signupNeedsConfirmation({ session: null })).toBe(true);
  });
  it("allows authenticated signup to continue without a second sign-in", () => {
    expect(signupNeedsConfirmation({ session: { user: { id: "confirmed" } } })).toBe(false);
  });
  it("honors the reported 55-second email cooldown", () => {
    expect(authCooldownSeconds({ message: "For security purposes, you can only request this after 55 seconds." })).toBe(55);
  });
  it("does not apply an email cooldown to credential errors", () => {
    expect(authCooldownSeconds({ status: 400, message: "Invalid login credentials" })).toBe(0);
  });
  it("guards rate-limited requests when the service supplies no duration", () => {
    expect(authCooldownSeconds({ status: 429 })).toBe(60);
  });
});