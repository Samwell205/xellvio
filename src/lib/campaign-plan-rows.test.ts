import { describe, it, expect } from "vitest";
import { buildCampaignPlanRow, buildPersonalizationBlockedRow } from "./campaign-plan-rows";

const blockedPatch = {
  status: "skipped",
  error_code: "personalization_flagged",
  failure_reason:
    "Skipped before charging: this contact's saved details contain restricted wording. Edit the contact and retry.",
};

const queuedRow = buildCampaignPlanRow({
  messageId: "11111111-1111-4111-8111-111111111111",
  campaignId: "22222222-2222-4222-8222-222222222222",
  profileId: "33333333-3333-4333-8333-333333333333",
  phoneE164: "+12125550142",
  countryCode: "US",
  segmentsCount: 2,
  isMms: false,
  cost: 0.033,
  renderedBody: "Hi Sam, your order update is ready.",
});

const blockedRow = buildPersonalizationBlockedRow(
  {
    messageId: "44444444-4444-4444-8444-444444444444",
    campaignId: "22222222-2222-4222-8222-222222222222",
    profileId: "55555555-5555-4555-8555-555555555555",
    phoneE164: "+12125550143",
    countryCode: "US",
    segmentsCount: 1,
    renderedBody: "Concealed Carry Handgun Training: your order update is ready.",
  },
  blockedPatch,
);

describe("campaign planning rows", () => {
  it("gives a flagged contact every column the queued rows carry", () => {
    // A missing column in a bulk upsert is written as NULL, which fails the
    // NOT NULL rule and rejects the whole batch — so no recipient is sent to.
    for (const key of Object.keys(queuedRow)) {
      expect(blockedRow).toHaveProperty(key);
      expect((blockedRow as Record<string, unknown>)[key]).not.toBeNull();
    }
  });

  it("charges and sends nothing for the flagged contact", () => {
    expect(blockedRow.cost).toBe(0);
    expect(blockedRow.is_mms).toBe(false);
    expect(blockedRow.status).toBe("skipped");
    expect(blockedRow.error_code).toBe("personalization_flagged");
    expect(blockedRow.segments_count).toBe(1);
    expect(blockedRow.phone_e164).toBe("+12125550143");
  });

  it("keeps the priced values on the queued row", () => {
    expect(queuedRow.segments_count).toBe(2);
    expect(queuedRow.cost).toBe(0.033);
    expect(queuedRow.is_mms).toBe(false);
    expect(queuedRow.rendered_body).toBe("Hi Sam, your order update is ready.");
  });
});
