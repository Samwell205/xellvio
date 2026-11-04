import { describe, it, expect } from "vitest";
import { twilioReceiptPayload } from "./twilio-receipt-recovery.server";

describe("dedicated-line receipt recovery", () => {
  it("records delivered and failed carrier results", () => {
    expect(twilioReceiptPayload({ sid: "SM1", status: "delivered" })?.data.payload.to[0].status).toBe("delivered");
    expect(twilioReceiptPayload({ sid: "SM1", status: "failed", error_code: 30002 })?.data.payload.to[0].errors[0].code).toBe("TW30002");
  });
  it("leaves in-flight messages untouched", () => {
    expect(twilioReceiptPayload({ sid: "SM1", status: "sent" })).toBeNull();
    expect(twilioReceiptPayload({ sid: "SM1", status: "queued" })).toBeNull();
  });
});
