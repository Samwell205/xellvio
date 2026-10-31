import { describe, expect, it } from 'vitest';
import { billingSummaryRows } from './admin-billing-summary';

describe('billing financial projections', () => {
  const account = { id: 'business', legal_business_name: 'Business', contact_email: null, email: 'owner@example.test', credit_balance: 8.32, created_at: '2026-10-31' };
  it('uses live wallet balance and exact saved ledger amounts', () => {
    const [row] = billingSummaryRows([account], [{ account_id: 'business', funded: '100.5', funded_payments: '2', spent: '94.18', refunded: '2' }]);
    expect(row).toMatchObject({ balance: 8.32, paid_usd: 100.5, payments_count: 2, spent: 94.18, refunded: 2 });
  });
  it('does not mix another business totals into a wallet', () => {
    const [row] = billingSummaryRows([account], [{ account_id: 'other', funded: 999, spent: 100 }]);
    expect(row).toMatchObject({ balance: 8.32, paid_usd: 0, spent: 0, refunded: 0, payments_count: 0 });
  });
});