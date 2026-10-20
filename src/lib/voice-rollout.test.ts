import { describe, it, expect } from "vitest";
import { isVoicePilotIdentity } from "./voice-rollout";
describe("Samuel-only voice pilot", () => {
  it("allows the owner's exact confirmed test email", () => {
    expect(isVoicePilotIdentity({email:"samueldurosinmi69@gmail.com",email_confirmed_at:"2026-10-20T16:56:00Z"})).toBe(true);
  });
  it("denies other tenants including the previous Samuel email", () => {
    expect(isVoicePilotIdentity({email:"samueldurosinmi64@gmail.com",email_confirmed_at:"2026-10-20T16:56:00Z"})).toBe(false);
    expect(isVoicePilotIdentity({email:"tenant@example.com",email_confirmed_at:"2026-10-20T16:56:00Z"})).toBe(false);
  });
  it("denies missing identities and unverified pilot email", () => {
    expect(isVoicePilotIdentity(null)).toBe(false);
    expect(isVoicePilotIdentity({email:"samueldurosinmi69@gmail.com"})).toBe(false);
  });
});