import { describe, expect, it } from 'vitest';
import { canAssignInventory, isApprovedVerification, isIsolatedNumber } from './twilio-inventory-rules';

describe('verified toll-free assignment', () => {
  it('requires actual carrier approval', () => {
    expect(isApprovedVerification('TWILIO_APPROVED')).toBe(true);
    expect(isApprovedVerification('PENDING_REVIEW')).toBe(false);
    expect(isApprovedVerification('TWILIO_REJECTED')).toBe(false);
  });
  it('never assigns one number to a second business', () => {
    const row = { verification_status: 'verified', available: true, assigned_account_id: 'tenant-a' };
    expect(canAssignInventory(row, 'tenant-a')).toBe(true);
    expect(canAssignInventory(row, 'tenant-b')).toBe(false);
  });
  it('does not sell a number without verified status', () => {
    expect(canAssignInventory({ verification_status: 'pending', available: true, assigned_account_id: null }, 'tenant-a')).toBe(false);
  });
  it('does not sell removed inventory', () => {
    expect(canAssignInventory({ verification_status: 'verified', available: false, assigned_account_id: null }, 'tenant-a')).toBe(false);
  });
  it('requires the number to reside in the receiving business subaccount', () => {
    expect(isIsolatedNumber('ACtenant', 'ACtenant', 'ACparent')).toBe(true);
    expect(isIsolatedNumber('ACparent', 'ACtenant', 'ACparent')).toBe(false);
    expect(isIsolatedNumber('ACother', 'ACtenant', 'ACparent')).toBe(false);
    expect(isIsolatedNumber('ACparent', 'ACparent', 'ACparent')).toBe(false);
  });
});