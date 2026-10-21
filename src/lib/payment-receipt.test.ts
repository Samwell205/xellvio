import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyPaymentReceipt } from './payment-receipt.server';
const state = vi.hoisted(() => ({ send: vi.fn(), status: 'paid' }));
vi.mock('@/lib/email/send-internal.server', () => ({ sendBrandedEmail: state.send }));
vi.mock('@/lib/admin-notify.server', () => ({ sendAdminSms: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-push.server', () => ({ sendAdminPush: vi.fn(async () => {}) }));
const admin = {
  from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'payments'
    ? { account_id: 'owner', status: state.status, amount: 30, credits: 30, currency: 'USD', metadata: { payer_user_id: 'member' } }
    : { email: 'owner@example.com', contact_email: 'billing@example.com', credit_balance: 55 } }) }) }) }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'member@example.com' } } }) } },
};
beforeEach(() => { state.status = 'paid'; state.send.mockReset(); });
describe('confirmed team payment receipts', () => {
  it('emails the business billing contact and the authenticated payer after crediting', async () => {
    await notifyPaymentReceipt(admin, 'test-ref', 'bank/card');
    expect(state.send.mock.calls.map(([data]) => data.recipientEmail)).toEqual(['billing@example.com', 'member@example.com']);
    expect(state.send.mock.calls.map(([data]) => data.idempotencyKey)).toEqual(['payment-receipt-test-ref', 'payment-receipt-test-ref-payer']);
  });
  it('never claims a pending payment was credited', async () => {
    state.status = 'pending';
    await notifyPaymentReceipt(admin, 'test-ref', 'bank/card');
    expect(state.send).not.toHaveBeenCalled();
  });
});