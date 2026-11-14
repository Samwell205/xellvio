import { describe, expect, it } from "vitest";
import { currentMaintenanceNotices } from "./support-maintenance";

const now = Date.parse("2026-11-14T20:42:00Z");
describe("support maintenance evidence", () => {
  it("excludes the unpublished October US/Canada pause that expired October 19", () => {
    expect(currentMaintenanceNotices([{ title: "SMS to the USA and Canada temporarily paused", published_at: null, expires_at: "2026-10-19T19:38:05.850714Z" }], now)).toEqual([]);
  });
  it("excludes expired published notices", () => {
    expect(currentMaintenanceNotices([{ title: "Past pause", published_at: "2026-10-08T07:18:50Z", expires_at: "2026-10-19T19:38:05Z" }], now)).toEqual([]);
  });
  it("excludes scheduled notices", () => {
    expect(currentMaintenanceNotices([{ title: "Scheduled", published_at: "2026-11-15T00:00:00Z", expires_at: null }], now)).toEqual([]);
  });
  it("retains current published notices", () => {
    expect(currentMaintenanceNotices([{ title: "Current", published_at: "2026-11-14T20:00:00Z", expires_at: null }], now).map(n => n.title)).toEqual(["Current"]);
  });
});