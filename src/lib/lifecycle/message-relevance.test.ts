import { describe, expect, it } from 'vitest';
import { lifecycleMessageRelevant, type LifecycleEligibility } from './visibility';
const row: LifecycleEligibility = { created_at: '2026-11-01T00:00:00Z', first_campaign_sent_at: '2026-11-03T00:00:00Z', launched_campaign_count: 30, workspace_completed_at: '2026-11-01T00:00:00Z', first_audience_at: '2026-11-01T00:00:00Z', first_contacts_at: '2026-11-01T00:00:00Z', first_campaign_at: '2026-11-01T00:00:00Z', first_automation_at: null, last_activity_at: '2026-11-05T00:00:00Z' };
describe('live message relevance', () => {
  it('never presents beginner setup prompts to a business with 30 campaigns', () => {
    for (const key of ['welcome', 'workspace_reminder', 'audience_reminder', 'contacts_reminder', 'campaign_reminder', 'send_reminder']) expect(lifecycleMessageRelevant(key, row)).toBe(false);
  });
  it('hides inactivity notices when the business returned', () => {
    expect(lifecycleMessageRelevant('inactive_7d', row, Date.parse('2026-11-05T01:00:00Z'))).toBe(false);
  });
  it('only suggests automations when that business has not created one', () => {
    expect(lifecycleMessageRelevant('feature_discovery_automation', row)).toBe(true);
    expect(lifecycleMessageRelevant('feature_discovery_automation', { ...row, first_automation_at: '2026-11-02T00:00:00Z' })).toBe(false);
  });
});