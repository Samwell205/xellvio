import { describe, expect, it } from "vitest";

import { dashboardLifecycleVisibility } from "./visibility";

describe("dashboardLifecycleVisibility", () => {
  it("keeps dashboard guidance visible from progress, not old dismissals", () => {
    expect(
      dashboardLifecycleVisibility({
        completed: 2,
        total: 6,
        firstCampaignSentAt: null,
      }),
    ).toEqual({
      showWelcome: true,
      celebrateFirstSend: false,
      checklistHidden: false,
    });
  });

  it("keeps the first-send celebration visible after a campaign was sent", () => {
    expect(
      dashboardLifecycleVisibility({
        completed: 6,
        total: 6,
        firstCampaignSentAt: "2026-10-06T11:57:00.000Z",
      }).celebrateFirstSend,
    ).toBe(true);
  });
});