import { describe, it, expect } from "vitest";
import { normalizeEmail } from "./contact-email";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com"));
  it("rejects non-emails", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("jane@")).toBeNull();
    expect(normalizeEmail("+1 555 0100")).toBeNull();
  });
});
