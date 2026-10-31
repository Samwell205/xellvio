/** Paid number purchases share stock checks and one durable settlement claim. */
export async function countPurchasableTfns(database: any): Promise<number> {
  const parentSid = process.env.TWILIO_ACCOUNT_SID;
  if (!parentSid) throw new Error('Number purchases are temporarily unavailable.');
  const { count, error } = await database.from('twilio_verified_inventory')
    .select('phone_sid', { count: 'exact', head: true })
    .eq('verification_status', 'verified').eq('available', true)
    .eq('assignment_state', 'available').is('assigned_account_id', null)
    .neq('owner_account_sid', parentSid);
  if (error) throw new Error('Number availability could not be checked. Please try again later.');
  return count ?? 0;
}

export async function assertTfnCheckoutAvailable(database: any, accountId: string) {
  const [{ data: line, error: lineError }, { data: reserved, error: reservationError }] = await Promise.all([
    database.from('tenant_twilio_lines').select('phone_number,status').eq('account_id', accountId).maybeSingle(),
    database.from('twilio_verified_inventory').select('phone_sid').eq('assigned_account_id', accountId).limit(1).maybeSingle(),
  ]);
  if (lineError || reservationError) throw new Error('Number availability could not be checked. Please try again later.');
  if (reserved || (line?.phone_number && line.status !== 'released')) throw new Error('Your business already has a dedicated number or an assignment in progress.');
  if (await countPurchasableTfns(database) <= 0) throw new Error('No verified toll-free numbers are available right now');
}

export type TfnSettlement = {
  assigned: { phone_number: string; country: string } | null;
  reviewRequired: boolean;
  alreadyPaid: boolean;
};

export async function settleTfnPurchase(database: any, payment: { id: string; account_id: string; metadata?: any }, metadata = payment.metadata): Promise<TfnSettlement> {
  // refund_pending is the existing manual-review status, NOT a refund instruction.
  // Claim before assignment: duplicate callbacks cannot assign twice. An interrupted
  // attempt remains visible for manual recovery instead of looking unpaid.
  const { data: claimed, error: claimError } = await database.from('payments').update({
    status: 'refund_pending', paid_at: new Date().toISOString(),
    admin_note: 'Payment received; number assignment in progress. Review if interrupted. No automatic refund.',
    metadata,
  }).eq('id', payment.id).eq('status', 'pending').select('id');
  if (claimError) throw new Error('Payment received but its status could not be recorded. Please contact support.');
  if (!claimed?.length) {
    const { data: current, error } = await database.from('payments').select('status').eq('id', payment.id).single();
    if (error) throw new Error('Payment status could not be checked.');
    return { assigned: null, reviewRequired: current.status === 'refund_pending', alreadyPaid: current.status === 'paid' };
  }
  try {
    const { assignTwilioInventory } = await import('./twilio-inventory.server');
    const assigned = await assignTwilioInventory(payment.account_id, undefined, 0);
    if (!assigned) throw new Error('Number assignment returned no number.');
    const { error } = await database.from('payments').update({
      status: 'paid', admin_note: `TFN assigned: ${assigned.phone_number}`, metadata,
    }).eq('id', payment.id).eq('status', 'refund_pending');
    if (error) throw new Error('Number assigned but payment completion could not be recorded.');
    return { assigned, reviewRequired: false, alreadyPaid: false };
  } catch (error) {
    console.error('[tfn-purchase] assignment needs review', payment.id, error);
    const { error: saveError } = await database.from('payments').update({
      admin_note: 'Payment received but number assignment did not complete. Review the number reservation and resolve manually; no automatic refund.',
      metadata,
    }).eq('id', payment.id).eq('status', 'refund_pending');
    // Attempt both alerts even if saving the extra detail fails: the claim is durable.
    try {
      const [{ sendAdminSms }, { sendAdminPush }] = await Promise.all([
        import('./admin-notify.server'), import('./admin-push.server'),
      ]);
      const results = await Promise.allSettled([
        sendAdminSms(`Xellvio: toll-free payment ${payment.id} received; assignment needs manual review. No automatic refund.`),
        sendAdminPush({ title: 'Paid number assignment needs review', body: `Payment ${payment.id}: check inventory and complete assignment or review manually.`, url: '/admin/billing', tag: `tfn-review-${payment.id}` }),
      ]);
      for (const result of results) if (result.status === 'rejected') console.error('[tfn-purchase] admin alert failed', result.reason);
    } catch (notifyError) { console.error('[tfn-purchase] admin alert failed', notifyError); }
    if (saveError) throw new Error('Payment received; assignment needs manual review.');
    return { assigned: null, reviewRequired: true, alreadyPaid: false };
  }
}