import { describe, expect, it } from "vitest";
import { canSendAssistantCampaign, summarizeAssistantDelivery } from "./assistant-campaign-status";
describe("assistant live campaign state", () => {
  it("only allows sending a live draft", () => {
    expect(canSendAssistantCampaign("draft")).toBe(true);
    for (const status of ["queued", "scheduled", "sending", "sent", "paused", undefined]) expect(canSendAssistantCampaign(status)).toBe(false);
  });
  it("keeps awaiting receipts separate from confirmed delivery and failure", () => {
    expect(summarizeAssistantDelivery({total:807,delivered:751,failed:16,sent:40,sent_with_error:0,delivery_unconfirmed:0,queued:0,sending:0})).toEqual({total:807,delivered:751,failed:16,awaitingDelivery:40,deliveryUnconfirmed:0,queued:0});
  });
  it("does not invent zero for unavailable report counts", () => {
    expect(summarizeAssistantDelivery(null).delivered).toBeNull();
    expect(summarizeAssistantDelivery({sent:4}).awaitingDelivery).toBeNull();
  });
});