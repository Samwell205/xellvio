import { describe, it, expect } from "vitest";
import { isValidSenderId } from "./sender-id-rules";

describe("sender ID rule", () => {
  it("rejects a UK mobile typed with a letter O", () => expect(isValidSenderId("O7401028795")).toBe(false));
  it("rejects a plain phone number", () => expect(isValidSenderId("07401028795")).toBe(false));
  it("accepts a brand name", () => expect(isValidSenderId("JEREMY")).toBe(true));
  it("accepts a brand with a few digits", () => expect(isValidSenderId("SHOP24")).toBe(true));
});
