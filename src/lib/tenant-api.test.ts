import { describe, expect, it } from "vitest";
import { API_SCOPES, apiRecipientSchema, safeFailureReason, sendBulkSchema, sendMessageSchema } from "./tenant-api.shared";
import { signWebhook } from "./tenant-api.server";

describe("tenant SMS API rules", () => {
  it("requires E.164 recipients and explicit consent", () => {
    expect(apiRecipientSchema.safeParse({ phone: "+14155550123", consent_confirmed: true }).success).toBe(true);
    expect(apiRecipientSchema.safeParse({ phone: "4155550123", consent_confirmed: true }).success).toBe(false);
    expect(apiRecipientSchema.safeParse({ phone: "+14155550123", consent_confirmed: false }).success).toBe(false);
  });

  it("limits bulk sends to 1,000 recipients", () => {
    const recipients = Array.from({ length: 1001 }, (_, index) => ({ phone: `+1415555${String(index).padStart(4, "0")}`, consent_confirmed: true as const }));
    expect(sendBulkSchema.safeParse({ name: "Large", body: "Hello", recipients }).success).toBe(false);
  });

  it("limits an SMS body to 1,600 characters", () => {
    expect(sendMessageSchema.safeParse({ to: "+14155550123", body: "a".repeat(1601), consent_confirmed: true }).success).toBe(false);
  });

  it("defines the four allowed key scopes", () => {
    expect(API_SCOPES).toEqual(["messages:send", "messages:read", "replies:read", "webhooks:manage"]);
  });

  it("creates stable HMAC signatures and hides provider names", () => {
    expect(signWebhook("secret", "1700000000", '{"id":"evt_1"}')).toBe("af784f27423c462e20039559cd4264140f7b7ed4c9090e26fd663faa5eeb8dda");
    expect(safeFailureReason("Telnyx rejected the destination")).toBe("carrier rejected the destination");
  });
});