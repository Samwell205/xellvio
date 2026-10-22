import { describe, it, expect } from "vitest";
import { uploadCountry, uploadNeedsCountry } from "./assistant-upload";

describe("upload-first details", () => {
  it("asks for a country when a list contains a local number", () => {
    expect(uploadNeedsCountry("phone,first_name\n4086580691,James")).toBe(true);
  });
  it("does not ask for a country for international numbers", () => {
    expect(uploadNeedsCountry("phone\n+14086580691\n00442079460000")).toBe(false);
  });
  it("asks when international and local formats are mixed", () => {
    expect(uploadNeedsCountry("+14086580691\n02079460000")).toBe(true);
  });
  it.each([["United States", "US"], ["United Kingdom", "GB"], ["Nigeria", "NG"], ["Denmark", "DK"], ["Canada", "CA"], ["UK", "GB"], ["US", "US"]])("accepts %s as %s", (name, code) => {
    expect(uploadCountry(name)).toBe(code);
  });
  it("does not guess ambiguous or invalid country answers", () => {
    expect(uploadCountry("any country")).toBeNull();
    expect(uploadCountry("ZZ")).toBeNull();
  });
});