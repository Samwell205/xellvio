import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ assign: vi.fn(), sms: vi.fn(), push: vi.fn() }));
vi.mock('./twilio-inventory.server', () => ({ assignTwilioInventory: mocks.assign }));
vi.mock('./admin-notify.server', () => ({ sendAdminSms: mocks.sms }));
vi.mock('./admin-push.server', () => ({ sendAdminPush: mocks.push }));
import { assertTfnCheckoutAvailable, countPurchasableTfns, settleTfnPurchase } from './tfn-purchase.server';

function database(options: { count?: number; stockError?: boolean; line?: any; reserved?: any } = {}) {
  const payment = { id: 'payment-1', account_id: 'business-1', status: 'pending', metadata: { purpose: 'tfn_purchase' } };
  const filters: Array<[string, string, unknown]> = [];
  const updates: any[] = [];
  const from = vi.fn((table: string) => {
    let patch: any;
    const conditions: Array<[string, unknown]> = [];
    const result = () => {
      if (table === 'payments') {
        if (patch) {
          const matches = conditions.every(([key, value]) => (payment as any)[key] === value);
          if (!matches) return { data: [], error: null };
          Object.assign(payment, patch); updates.push(patch);
          return { data: [{ id: payment.id }], error: null };
        }
        return { data: { ...payment }, error: null };
      }
      if (table === 'tenant_twilio_lines') return { data: options.line ?? null, error: null };
      if (conditions.some(([key]) => key === 'assigned_account_id')) return { data: options.reserved ?? null, error: null };
      return { count: options.count ?? 0, error: options.stockError ? { message: 'unavailable' } : null };
    };
    const q: any = {
      select: () => q, limit: () => q,
      eq: (key: string, value: unknown) => { conditions.push([key, value]); filters.push(['eq', key, value]); return q; },
      neq: (key: string, value: unknown) => { filters.push(['neq', key, value]); return q; },
      is: (key: string, value: unknown) => { filters.push(['is', key, value]); return q; },
      update: (value: any) => { patch = value; return q; },
      maybeSingle: async () => result(), single: async () => result(),
      then: (resolve: (value: any) => void) => resolve(result()),
    };
    return q;
  });
  return { from, payment, filters, updates };
}

beforeEach(() => { vi.clearAllMocks(); mocks.assign.mockReset(); vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACparent'); });
afterEach(() => vi.unstubAllEnvs());

describe('toll-free purchase stock', () => {
  it('refuses checkout when real inventory is empty, without consulting the legacy pool', async () => {
    const db = database();
    await expect(assertTfnCheckoutAvailable(db, 'business-1')).rejects.toThrow('No verified toll-free numbers');
    expect(db.from.mock.calls.map(([table]) => table)).not.toContain('shared_tollfree_pool');
    expect(db.from.mock.calls.map(([table]) => table)).not.toContain('verifier_tfns');
  });
  it('counts only verified available unassigned sub-account inventory', async () => {
    const db = database({ count: 2 });
    expect(await countPurchasableTfns(db)).toBe(2);
    expect(db.filters).toEqual([
      ['eq', 'verification_status', 'verified'], ['eq', 'available', true],
      ['eq', 'assignment_state', 'available'], ['is', 'assigned_account_id', null], ['neq', 'owner_account_sid', 'ACparent'],
    ]);
  });
  it('fails closed when stock cannot be read', async () => {
    await expect(countPurchasableTfns(database({ stockError: true }))).rejects.toThrow('could not be checked');
  });
  it.each([
    { line: { phone_number: '+18553820888', status: 'active' } },
    { reserved: { phone_sid: 'PNreserved' } },
  ])('prevents another checkout for an existing number or reservation: %j', async (options) => {
    await expect(assertTfnCheckoutAvailable(database({ count: 2, ...options }), 'business-1')).rejects.toThrow('already has a dedicated number');
  });
});

describe('paid toll-free fulfilment', () => {
  it.each(['No unassigned verified number is available.', 'This business already has a dedicated number.', 'Carrier request failed'])('records and alerts assignment failure: %s', async (message) => {
    const db = database();
    mocks.assign.mockRejectedValue(new Error(message));
    expect(await settleTfnPurchase(db, db.payment)).toEqual({ assigned: null, reviewRequired: true, alreadyPaid: false });
    expect(db.payment.status).toBe('refund_pending');
    expect(mocks.assign).toHaveBeenCalledWith('business-1', undefined, 0);
    expect(mocks.sms).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(db.from.mock.calls.every(([table]) => table === 'payments')).toBe(true);
    expect(db.updates.some(update => update.status === 'refunded')).toBe(false);
    await settleTfnPurchase(db, db.payment);
    expect(mocks.assign).toHaveBeenCalledTimes(1);
    expect(mocks.sms).toHaveBeenCalledTimes(1);
  });
  it('settles once and duplicate callbacks do not assign again', async () => {
    const db = database();
    mocks.assign.mockResolvedValue({ phone_number: '+18553820888', country: 'US', status: 'active' });
    const results = await Promise.all([settleTfnPurchase(db, db.payment), settleTfnPurchase(db, db.payment)]);
    expect(results.some(result => result.assigned?.phone_number === '+18553820888')).toBe(true);
    expect(db.payment.status).toBe('paid');
    expect(mocks.assign).toHaveBeenCalledTimes(1);
    expect((await settleTfnPurchase(db, db.payment)).alreadyPaid).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('attempts push even when SMS notification fails', async () => {
    const db = database();
    mocks.assign.mockRejectedValue(new Error('No inventory'));
    mocks.sms.mockRejectedValueOnce(new Error('SMS unavailable'));
    await settleTfnPurchase(db, db.payment);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(db.payment.status).toBe('refund_pending');
  });
});