export function isApprovedVerification(status: unknown): boolean {
  return String(status ?? '').toUpperCase() === 'TWILIO_APPROVED';
}

export function canAssignInventory(row: { verification_status: string; assigned_account_id: string | null; available: boolean }, accountId: string): boolean {
  return row.verification_status === 'verified' && row.available && (!row.assigned_account_id || row.assigned_account_id === accountId);
}

export function isIsolatedNumber(ownerSid: string, tenantSid: string | null, parentSid: string): boolean {
  return Boolean(tenantSid && tenantSid !== parentSid && ownerSid === tenantSid);
}