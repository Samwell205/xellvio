import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), single: vi.fn(), eq: vi.fn(), accountId: '' }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: (_field: string, id: string) => { mocks.accountId = id; return { maybeSingle: mocks.single }; } }) }) } }));
vi.mock('./email/send-internal.server', () => ({ sendBrandedEmail: mocks.send }));
import { notifyAccountStatus } from './account-status-notice.server';
describe('affected-account status notice', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.single.mockResolvedValue({ data: { email: 'owner@example.com', contact_email: 'business@example.com', full_name: 'Jane Owner' }, error: null }); mocks.send.mockResolvedValue({ success: true }); });
  it('sends only to the affected business contact and scopes its key to the event', async () => {
    await notifyAccountStatus('business-1', 'sending_suspended', 'hold-1');
    expect(mocks.accountId).toBe('business-1');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].recipientEmail).toBe('business@example.com');
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe('account-status-business-1-sending_suspended-hold-1');
  });
  it('uses the owner email when the affected business has no contact address', async () => {
    mocks.single.mockResolvedValue({ data: { email: 'owner@example.com', contact_email: null }, error: null });
    await notifyAccountStatus('business-1','account_restored','restore-1');
    expect(mocks.send.mock.calls[0][0].recipientEmail).toBe('owner@example.com');
  });
  it('does not send to an unrelated fallback when there is no recipient', async () => {
    mocks.single.mockResolvedValue({ data: { email: null, contact_email: null }, error: null });
    await notifyAccountStatus('business-1','account_suspended','suspend-1');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});