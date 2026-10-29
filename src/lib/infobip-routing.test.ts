import { describe, expect, it } from "vitest";
import { isInfobipDestination, mapInfobipStatus } from "./infobip-routing";

describe("isInfobipDestination", () => {
  it("routes international destinations to the international route", () => {
    expect(isInfobipDestination("+2348012345678")).toBe(true);
    expect(isInfobipDestination("+4915123456789")).toBe(true);
    expect(isInfobipDestination("+971501234567")).toBe(true);
  });

  it("keeps US/Canada on the primary route", () => {
    expect(isInfobipDestination("+15551234567")).toBe(false);
    expect(isInfobipDestination("+14165551234")).toBe(false);
  });

  it("keeps UK on the UK route", () => {
    expect(isInfobipDestination("+447542683958")).toBe(false);
  });

  it("never takes picture messages", () => {
    expect(isInfobipDestination("+2348012345678", { hasMedia: true })).toBe(false);
  });

  it("rejects malformed numbers", () => {
    expect(isInfobipDestination("not-a-number")).toBe(false);
    expect(isInfobipDestination("")).toBe(false);
  });
});

describe("mapInfobipStatus", () => {
  it("maps final terminal groups", () => {
    expect(mapInfobipStatus("DELIVERED")).toBe("delivered");
    expect(mapInfobipStatus("UNDELIVERABLE")).toBe("delivery_failed");
    expect(mapInfobipStatus("REJECTED")).toBe("delivery_failed");
    expect(mapInfobipStatus("EXPIRED")).toBe("delivery_failed");
  });

  it("maps non-terminal groups to sent", () => {
    expect(mapInfobipStatus("ACCEPTED")).toBe("sent");
    expect(mapInfobipStatus("PENDING")).toBe("sent");
  });

  it("treats unknown groups as non-terminal", () => {
    expect(mapInfobipStatus("")).toBe("sent");
    expect(mapInfobipStatus(undefined)).toBe("sent");
  });

  it("does not mistake UNDELIVERABLE for DELIVERED", () => {
    expect(mapInfobipStatus("UNDELIVERABLE")).not.toBe("delivered");
  });

  it("falls back to the status name when the group is missing", () => {
    expect(mapInfobipStatus(undefined, "DELIVERED")).toBe("delivered");
  });
});
