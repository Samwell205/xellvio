import { describe, expect, it } from "vitest";

import { DEFAULT_LOCAL_PRICE_USD, isValidAreaCode } from "./local-number.server";

describe("local number sales", () => {
  it("sells a verified local number for $100", () => {
    expect(DEFAULT_LOCAL_PRICE_USD).toBe(100);
  });

  it("accepts a real 3-digit US area code", () => {
    expect(isValidAreaCode("212")).toBe(true);
    expect(isValidAreaCode(" 415 ")).toBe(true);
  });

  it("rejects codes that cannot be area codes", () => {
    expect(isValidAreaCode("123")).toBe(false); // area codes never start with 1
    expect(isValidAreaCode("911")).toBe(false); // reserved service code
    expect(isValidAreaCode("21")).toBe(false);
    expect(isValidAreaCode("2123")).toBe(false);
    expect(isValidAreaCode("abc")).toBe(false);
  });
});
