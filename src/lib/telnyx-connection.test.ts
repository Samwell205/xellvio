import { describe, expect, it } from "vitest";
import { SECONDARY_PROFILE_ID, SECONDARY_WORKSPACE_ID, secondaryCampaignMaySend, usesSecondaryConnection } from "./telnyx-connection";

describe("additional messaging connection isolation", () => {
  it("never restarts this workspace's campaigns created before activation", () => {
    expect(secondaryCampaignMaySend(SECONDARY_WORKSPACE_ID, "2026-09-21T19:58:35Z")).toBe(false);
    expect(secondaryCampaignMaySend(SECONDARY_WORKSPACE_ID, "2026-10-18T21:00:00Z")).toBe(true);
    expect(secondaryCampaignMaySend("another-workspace", "2026-09-21T19:58:35Z")).toBe(false);
    expect(secondaryCampaignMaySend("another-workspace", "2026-10-18T22:00:00Z")).toBe(true);
  });
  it("routes the new profile to the additional connection", () => {
    expect(usesSecondaryConnection("4001a150-a55c-460f-ae5d-02acca3f97a7")).toBe(true);
  });
  it("keeps the original profile on the original connection", () => {
    expect(usesSecondaryConnection("40019f2a-14c7-4447-8b7b-d4cb04511b5a")).toBe(false);
  });
  it("never falls back to secondary for missing or unrelated profiles", () => {
    expect(usesSecondaryConnection(undefined)).toBe(false);
    expect(usesSecondaryConnection("unrelated")).toBe(false);
    expect(usesSecondaryConnection(SECONDARY_PROFILE_ID)).toBe(true);
  });
});