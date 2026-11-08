import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isGeoPermissionError, geoRegionKey, isGeoBlocked, withGeoBlock, GEO_BLOCK_MS } from "./carrier-geo-guard";

describe("carrier geo guard", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  it("recognises destination-permission rejections", () => {
    expect(isGeoPermissionError("TW21408")).toBe(true);
    expect(isGeoPermissionError("21408")).toBe(true);
    expect(isGeoPermissionError("30003")).toBe(false);
  });
  it("does not classify recipient/sender error 21612 as a region permission error", () => {
    expect(isGeoPermissionError("TW21612")).toBe(false);
    expect(isGeoPermissionError("21612")).toBe(false);
  });
  it("separates Puerto Rico from the mainland US", () => {
    expect(geoRegionKey("+17875551234")).toBe("+1787");
    expect(geoRegionKey("+12125551234")).toBe("+1212");
  });
  it("blocks the same region after a rejection, but not other regions", () => {
    const b = withGeoBlock({}, "+17875551234", now);
    expect(isGeoBlocked(b, "+17879999999", now + 1000)).toBe(true);
    expect(isGeoBlocked(b, "+12125551234", now + 1000)).toBe(false);
  });
  it("allows a fresh attempt after 6 hours", () => {
    const b = withGeoBlock({}, "+17875551234", now);
    expect(isGeoBlocked(b, "+17875551234", now + GEO_BLOCK_MS + 1)).toBe(false);
    expect(withGeoBlock(b, "+12125551234", now + GEO_BLOCK_MS + 1)).not.toHaveProperty("+1787");
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
