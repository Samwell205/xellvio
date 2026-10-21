import { describe, it, expect, vi } from 'vitest';
import { resolveBillingAccount } from './billing-account.server';

const state = vi.hoisted(() => ({ acting: { accountId: 'owner-id', userId: 'teammate-id', isOwner: false, permissions: { billing: true } } }));
vi.mock('./acting-account.server', () => ({
  resolveActingAccount: vi.fn(async () => state.acting),
  assertPermission: (acting: typeof state.acting, key: 'billing') => {
    if (!acting.isOwner && !acting.permissions[key]) throw new Error('No billing permission');
  },
}));
describe('shared team funding', () => {
  it('funds the business owner rather than the authorized teammate', async () => {
    expect((await resolveBillingAccount('teammate-id')).accountId).toBe('owner-id');
  });
  it('rejects a teammate without billing access', async () => {
    state.acting.permissions.billing = false;
    await expect(resolveBillingAccount('teammate-id')).rejects.toThrow('No billing permission');
    state.acting.permissions.billing = true;
  });
});