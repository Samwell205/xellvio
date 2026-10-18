import { describe, expect, it } from "vitest";
import { SECONDARY_PROFILE_ID, usesSecondaryConnection } from "./telnyx-connection";

describe("additional messaging connection isolation", () => {
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