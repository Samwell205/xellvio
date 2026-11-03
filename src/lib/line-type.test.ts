import { describe, expect, it } from "vitest";
import { classifyOffline, isTextable } from "./line-type.server";

describe("free phone type check", () => {
  it("detects UK landlines, UK mobiles and US toll-free from the number alone", () => {
    expect(classifyOffline("+442079460000")).toBe("landline");
    expect(classifyOffline("+447494883874")).toBe("mobile");
    expect(classifyOffline("+18664725941")).toBe("toll_free");
  });
  it("never blocks ordinary US/Canada numbers it cannot tell apart", () => {
    expect(classifyOffline("+12063345949")).toBe("unknown");
    expect(isTextable(classifyOffline("+12063345949"))).toBe(true);
  });
});

describe("textable line types", () => {
  it("blocks landlines and toll-free lines but keeps mobile, VoIP and unchecked numbers", () => {
    expect(isTextable("landline")).toBe(false);
    expect(isTextable("toll_free")).toBe(false);
    expect(isTextable("mobile")).toBe(true);
    expect(isTextable("voip")).toBe(true);
    expect(isTextable(null)).toBe(true);
  });
});
