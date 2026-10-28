import { describe, expect, it } from "vitest";
import { isSinchDestination, isSinchMessageId, mapSinchStatus } from "./sinch-routing";

describe("UK second route", () => {
  it("routes UK mobiles", () => expect(isSinchDestination("+447542683958")).toBe(true));
  it("keeps US numbers on the primary route", () => expect(isSinchDestination("+17049286912")).toBe(false));
  it("keeps UK MMS on the primary route", () => expect(isSinchDestination("+447542683958", { hasMedia: true })).toBe(false));
  it("recognises route message ids", () => {
    expect(isSinchMessageId("01M61BWZ1RXQDD2CE3RSB6EK2E")).toBe(true);
    expect(isSinchMessageId("4031a178-86b4-4614-806a-4691274bf5b7")).toBe(false);
  });
  it("maps final statuses", () => {
    expect(mapSinchStatus("DELIVERED")).toBe("delivered");
    expect(mapSinchStatus("FAILED")).toBe("delivery_failed");
    expect(mapSinchStatus("QUEUED_ON_CHANNEL")).toBe("sent");
  });
});
