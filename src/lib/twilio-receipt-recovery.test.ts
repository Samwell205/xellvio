import { describe, expect, it } from "vitest";
import { isStaleNoReport } from "./twilio-receipt-recovery.server";

const now = Date.parse("2026-11-05T19:00:00Z");

describe("no-delivery-report relabel", () => {
  it("relabels a text the network still shows as sent after 24 hours", () => {
    expect(isStaleNoReport("sent", "2026-11-04T18:00:00Z", now, 24)).toBe(true);
  });
  it("keeps waiting when it is younger than 24 hours", () => {
    expect(isStaleNoReport("sent", "2026-11-05T01:00:00Z", now, 24)).toBe(false);
  });
  it("never relabels texts the carrier has not handed to the network yet", () => {
    expect(isStaleNoReport("queued", "2026-11-01T00:00:00Z", now, 24)).toBe(false);
    expect(isStaleNoReport("sending", "2026-11-01T00:00:00Z", now, 24)).toBe(false);
    expect(isStaleNoReport("accepted", "2026-11-01T00:00:00Z", now, 24)).toBe(false);
  });
});
