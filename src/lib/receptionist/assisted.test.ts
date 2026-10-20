import { describe, expect, it } from "vitest";
import { ASSISTED_NUMBER_FEE_USD, ASSISTED_NUMBER_TARGET_HOURS, canCompleteAssistedRequest } from "./assisted";

describe("assisted number requests", () => {
  it("charges the owner's one-time $100 fee", () => expect(ASSISTED_NUMBER_FEE_USD).toBe(100));
  it("sets a 24-hour support handling target", () => expect(ASSISTED_NUMBER_TARGET_HOURS).toBe(24));
  it("requires the exact requested number", () => expect(canCompleteAssistedRequest("+442012345678", "+442087654321", "verified")).toBe(false));
  it("never treats payment or pending carrier checks as approval", () => {
    expect(canCompleteAssistedRequest("+442012345678", "+442012345678", "number_pending")).toBe(false);
    expect(canCompleteAssistedRequest("+442012345678", "+442012345678", "verified")).toBe(true);
  });
});