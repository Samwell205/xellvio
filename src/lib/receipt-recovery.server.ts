import { getMessage } from './telnyx.server';

// Only authoritative terminal receipts may repair aged-out messages.
export function receiptUpdate(message: any): Record<string, unknown> | null {
  const recipient = Array.isArray(message?.to) ? message.to[0] : null;
  const raw = String(recipient?.status ?? message?.status ?? '').toLowerCase();
  const error = recipient?.errors?.[0] ?? message?.errors?.[0];
  const status = raw === 'delivered' ? 'delivered'
    : ['delivery_failed', 'delivery failed'].includes(raw) ? 'undelivered'
    : ['sending_failed', 'sending failed'].includes(raw) ? 'failed'
    : raw === 'delivery_unconfirmed' ? 'delivery_unconfirmed' : null;
  if (!status) return null;
  return {
    status,
    error_code: status === 'delivered' ? null : error?.code ? String(error.code) : null,
    failure_reason: status === 'delivered' ? null : String(error?.detail ?? error?.title ?? 'Carrier finalized the message without a delivery confirmation.').replace(/telnyx/gi, 'carrier').slice(0, 500),
    ...(status === 'delivered' ? { delivered_at: recipient?.delivered_at ?? message?.completed_at ?? new Date().toISOString() } : {}),
  };
}

export async function recoverReceiptPage(admin: any, campaignId: string, after?: string) {
  let query = admin.from('messages').select('id,provider_message_id,status')
    .eq('campaign_id', campaignId).in('status', ['sent', 'accepted', 'delivery_unconfirmed'])
    .not('provider_message_id', 'is', null).filter('provider_message_id', 'not.ilike', 'SM%')
    .order('id', { ascending: true }).limit(60).abortSignal(AbortSignal.timeout(3000));
  if (after) query = query.gt('id', after);
  const { data, error } = await query;
  if (error) throw new Error('Could not load delivery receipts. Please retry.');
  const rows = data ?? [];
  let checked = 0, updated = 0, errors = 0, stillAwaiting = 0;
  let nextCursor = after ?? null;
  const deadline = Date.now() + 20_000;
  for (let i = 0; i < rows.length && Date.now() < deadline - 8000; i += 6) {
    const chunk = rows.slice(i, i + 6);
    await Promise.all(chunk.map(async (row: any) => {
      checked++;
      try {
        const receipt = await getMessage(row.provider_message_id, true);
        const update = receiptUpdate(receipt);
        if (!update) { stillAwaiting++; return; }
        const { data: changed, error: writeError } = await admin.from('messages').update(update)
          .eq('id', row.id).eq('status', row.status).select('id').abortSignal(AbortSignal.timeout(3000));
        if (writeError) throw writeError;
        updated += changed?.length ?? 0;
        const { error: eventError } = await admin.from('events').insert({ message_id: row.id, type: `reconcile:${update.status}`, payload: receipt }).abortSignal(AbortSignal.timeout(3000));
        if (eventError) console.error('[receipt-recovery] audit write failed');
      } catch { errors++; }
    }));
    nextCursor = chunk[chunk.length - 1]?.id ?? nextCursor;
  }
  return { checked, updated, errors, stillAwaiting, nextCursor, done: checked === rows.length && rows.length < 60 };
}