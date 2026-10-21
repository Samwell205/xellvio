import { resolveActingAccount, assertPermission } from './acting-account.server';

/** Always derive the funded business from authenticated membership, never input. */
export async function resolveBillingAccount(userId: string) {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, 'billing');
  return acting;
}