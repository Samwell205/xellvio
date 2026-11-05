import { lifecycleMessageRelevant } from './visibility';
const OPTIONAL_KEYS = new Set(['workspace_reminder','audience_reminder','contacts_reminder','campaign_reminder','send_reminder','inactive_3d','inactive_7d','inactive_14d','feature_discovery_automation','feature_announcement','upgrade_recommendation']);
export async function queuedLifecycleEmailRelevant(db: any, payload: Record<string, any>, externalSender: boolean): Promise<boolean> {
  const id = typeof payload.message_id === 'string' ? payload.message_id : '';
  const match = id.match(/^lifecycle-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (!match) return true;
  const [, key, accountId] = match;
  if (OPTIONAL_KEYS.has(key) && !externalSender) return false;
  const { data: row, error } = await db.from('tenant_lifecycle').select('*').eq('account_id', accountId).maybeSingle();
  const { count, error: countError } = await db.from('campaigns').select('id', { count: 'exact', head: true }).eq('account_id', accountId).not('first_launched_at','is',null);
  if (error || countError) throw new Error('Queued lifecycle email eligibility unavailable');
  if (!row) return false;
  return lifecycleMessageRelevant(key, { ...row, launched_campaign_count: count ?? 0 });
}