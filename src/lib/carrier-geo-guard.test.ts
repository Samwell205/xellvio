import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isGeoPermissionError } from "./carrier-geo-guard";

describe("carrier geo guard", () => {
  it("recognises destination-permission rejections", () => {
    expect(isGeoPermissionError("TW21408")).toBe(true);
    expect(isGeoPermissionError("21408")).toBe(true);
    expect(isGeoPermissionError("30003")).toBe(false);
  });
  it("does not classify recipient/sender error 21612 as a region permission error", () => {
    expect(isGeoPermissionError("TW21612")).toBe(false);
    expect(isGeoPermissionError("21612")).toBe(false);
  });
});

describe("destination isolation in dispatch", () => {
  it("never reads or writes global region blocks inferred from one recipient rejection", () => {
    const src = readFileSync("src/routes/api.public.dispatch-campaign.ts", "utf8");
    expect(src).not.toContain('"carrier_geo_blocks"');
    expect(src).not.toContain("isGeoBlocked(");
    expect(src).not.toContain('error_code: "destination_not_enabled"');
  });
});
