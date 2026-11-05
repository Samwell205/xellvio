import { describe, expect, it } from 'vitest';
import { dashboardLifecycleVisibility } from './visibility';
const now = Date.parse('2026-11-05T07:00:00Z');
const input = { completed: 5, total: 5, firstCampaignSentAt: '2026-11-05T06:00:00Z', launchedCampaignCount: 1, trackingStartedAt: '2026-11-01T00:00:00Z', now };
describe('first campaign targeting', () => {
  it('never congratulates a business with 30 launched campaigns', () => {
    expect(dashboardLifecycleVisibility({ ...input, launchedCampaignCount: 30 }).celebrateFirstSend).toBe(false);
  });
  it('does not replay campaigns predating lifecycle tracking', () => {
    expect(dashboardLifecycleVisibility({ ...input, trackingStartedAt: '2026-11-05T06:30:00Z' }).celebrateFirstSend).toBe(false);
  });
  it('celebrates a real recent first launch after tracking began', () => {
    expect(dashboardLifecycleVisibility(input).celebrateFirstSend).toBe(true);
  });
  it('expires first-launch congratulations after 48 hours', () => {
    expect(dashboardLifecycleVisibility({ ...input, firstCampaignSentAt: '2026-11-02T06:00:00Z' }).celebrateFirstSend).toBe(false);
  });
});