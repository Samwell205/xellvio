import { describe, expect, it } from 'vitest';
import { queuedLifecycleEmailRelevant } from './queued-message.server';
const account='00000000-0000-4000-8000-000000000001';
function db(count: number) {
  const query: any = { select: () => query, eq: () => query, not: async () => ({ count, error: null }), maybeSingle: async () => ({ data: { created_at: '2026-11-01T00:00:00Z', first_campaign_sent_at: new Date().toISOString() }, error: null }) };
  return { from: () => query };
}
describe('queued lifecycle relevance', () => {
  it('drops previously queued first-success mail for 30-campaign businesses', async () => {
    expect(await queuedLifecycleEmailRelevant(db(30), { message_id: `lifecycle-first_success-${account}` }, true)).toBe(false);
  });
  it('does not affect a support confirmation', async () => {
    expect(await queuedLifecycleEmailRelevant(db(30), { message_id: 'ticket-opened' }, false)).toBe(true);
  });
  it('does not let old optional promotions fall back to built-in app email', async () => {
    expect(await queuedLifecycleEmailRelevant(db(0), { message_id: `lifecycle-inactive_14d-${account}` }, false)).toBe(false);
  });
});