import { describe, expect, it } from "vitest";
import { isTwilioMessageId, mapTwilioStatus, shouldUseBackup } from "./twilio-backup-routing";

const base = { to: "+17049286912", enabled: true };

describe("US backup route", () => {
  it("is off unless enabled", () => {
    expect(shouldUseBackup({ ...base, enabled: false, primaryStatus: 402 })).toBe(false);
  });
  it("fails over on primary funding/auth/unavailable refusals", () => {
    expect(shouldUseBackup({ ...base, primaryStatus: 402 })).toBe(true);
    expect(shouldUseBackup({ ...base, primaryStatus: 503 })).toBe(true);
  });
  it("never fails over on timeouts or carrier refusals", () => {
    expect(shouldUseBackup({ ...base, primaryStatus: null, primaryDetail: "timeout" })).toBe(false);
    expect(shouldUseBackup({ ...base, primaryStatus: 400, primaryDetail: "40002 spam" })).toBe(false);
  });
  it("only US/Canada text, no MMS", () => {
    expect(shouldUseBackup({ ...base, to: "+447542683958", primaryStatus: 402 })).toBe(false);
    expect(shouldUseBackup({ ...base, hasMedia: true, primaryStatus: 402 })).toBe(false);
  });
  it("recognises ids and statuses", () => {
    expect(isTwilioMessageId("SM" + "a".repeat(32))).toBe(true);
    expect(isTwilioMessageId("4031a178-86b4-4614-806a-4691274bf5b7")).toBe(false);
    expect(mapTwilioStatus("undelivered")).toBe("delivery_failed");
    expect(mapTwilioStatus("queued")).toBe(null);
  });
});
