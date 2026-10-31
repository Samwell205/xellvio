import { isApprovedVerification } from './twilio-inventory-rules';

const API = 'https://api.twilio.com/2010-04-01';
const TFV = 'https://messaging.twilio.com/v1/Tollfree/Verifications';
async function db() { return (await import('@/integrations/supabase/client.server')).supabaseAdmin as any; }
function credentials() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Number management is unavailable: the saved account credentials are missing.');
  return { sid, token };
}
const auth = (sid: string, token: string) => 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
async function request(url: string, authorization: string, body?: Record<string, string>): Promise<any> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: authorization, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: body ? new URLSearchParams(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const text = await response.text();
    console.error(`[number inventory] ${response.status}: ${text}`);
    throw new Error(`Number account request failed (${response.status}): ${text.slice(0, 400)}`);
  }
  return response.json();
}
async function pages(url: string, authorization: string, key: string) {
  const items: any[] = [];
  for (let count = 0; url && count < 30; count++) {
    const result = await request(url, authorization);
    items.push(...(result[key] ?? []));
    const next = result.next_page_uri ?? result.meta?.next_page_url;
    if (!next) return items;
    const resolved = new URL(next, url);
    if (!['api.twilio.com', 'messaging.twilio.com'].includes(resolved.hostname)) throw new Error('Unexpected number-list address.');
    url = resolved.href;
  }
  if (url) throw new Error('Number inventory is too large for one refresh. No partial result was saved.');
  return items;
}
export async function syncTwilioInventory() {
  const database = await db();
  const parent = credentials();
  const authorization = auth(parent.sid, parent.token);
  // Uses the app's existing parent credentials, not the separate chat connector key.
  const accounts = await pages(`${API}/Accounts.json?PageSize=50&Status=active`, authorization, 'accounts');
  const scopes = [{ sid: parent.sid, token: parent.token }, ...accounts.filter(a => a.sid !== parent.sid && a.owner_account_sid === parent.sid).map(a => ({ sid: a.sid, token: a.auth_token }))];
  const { data: lines, error: lineError } = await database.from('tenant_twilio_lines').select('account_id,subaccount_sid,phone_sid,status');
  if (lineError) throw new Error(lineError.message);
  let synced = 0;
  for (const scope of scopes) {
    if (!scope.token) throw new Error('A number sub-account could not be authenticated.');
    const numbers = await pages(`${API}/Accounts/${scope.sid}/IncomingPhoneNumbers.json?PageSize=50`, authorization, 'incoming_phone_numbers');
    const tollfree = numbers.filter(n => /^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(n.phone_number));
    if (!tollfree.length) continue;
    const verifications = await pages(`${TFV}?PageSize=50`, auth(scope.sid, scope.token), 'verifications');
    for (const number of tollfree) {
      const matches = verifications.filter(v => v.tollfree_phone_number_sid === number.sid);
      const verification = matches.find(v => isApprovedVerification(v.status)) ?? matches[0];
      const line = (lines ?? []).find((l: any) => l.phone_sid === number.sid && l.subaccount_sid === scope.sid && l.status !== 'released');
      const { data: prior } = await database.from('twilio_verified_inventory').select('phone_sid').eq('phone_sid', number.sid).maybeSingle();
      const row = { phone_sid: number.sid, phone_number: number.phone_number, owner_account_sid: scope.sid, verification_sid: verification?.sid ?? null, verification_status: isApprovedVerification(verification?.status) ? 'verified' : 'pending', synced_at: new Date().toISOString(), ...(line ? { assigned_account_id: line.account_id, assignment_state: 'assigned' } : {}) };
      const { error } = prior ? await database.from('twilio_verified_inventory').update(row).eq('phone_sid', number.sid) : await database.from('twilio_verified_inventory').insert(row);
      if (error) throw new Error(error.message);
      synced++;
    }
  }
  return { synced };
}
export async function listTwilioInventory() {
  const database = await db();
  const { data, error } = await database.from('twilio_verified_inventory').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map((n: any) => n.assigned_account_id).filter(Boolean))];
  const { data: accounts } = ids.length ? await database.from('accounts').select('id,email,legal_business_name').in('id', ids) : { data: [] };
  return (data ?? []).map((n: any) => ({ ...n, assigned_to: accounts?.find((a: any) => a.id === n.assigned_account_id) ?? null }));
}
export async function assignTwilioInventory(accountId: string, phone?: string, price = 0) {
  const database = await db();
  const parent = credentials();
  const { data: business, error: businessError } = await database.from('accounts').select('id,onboarding_status,sending_suspended_at').eq('id', accountId).single();
  if (businessError || !business) throw new Error('Business not found.');
  if (business.onboarding_status === 'suspended' || business.sending_suspended_at) throw new Error('Sending is on hold for this business.');
  const { data: reserved, error } = await database.rpc('reserve_twilio_inventory', { _account_id: accountId, _phone_number: phone ?? null, _price: price });
  if (error) throw new Error(error.message);
  const row = Array.isArray(reserved) ? reserved[0] : reserved;
  if (!row) throw new Error('Number reservation failed.');
  const { data: leased, error: leaseError } = await database.rpc('lease_twilio_inventory', { _phone_sid: row.phone_sid, _account_id: accountId });
  if (leaseError || !leased) throw new Error('This assignment is already being processed. Check its status before retrying.');
  try {
    const { data: line, error: readError } = await database.from('tenant_twilio_lines').select('*').eq('account_id', accountId).single();
    if (readError) throw new Error(readError.message);
    if (!line) throw new Error('Assignment record not found.');
    // Owner decision: never move an approved number to another sub-account, because a move
    // forces the carrier verification to be resubmitted. The number stays where it is approved.
    const sid: string = row.owner_account_sid;
    if (!sid || sid === parent.sid) throw new Error('This number is not in a sub-account and cannot be assigned.');
    const owned = await request(`${API}/Accounts/${sid}/IncomingPhoneNumbers/${row.phone_sid}.json`, auth(parent.sid, parent.token));
    if (owned.account_sid !== sid) throw new Error('Number ownership could not be confirmed. Refresh the list and try again.');
    const account = await request(`${API}/Accounts/${sid}.json`, auth(parent.sid, parent.token));
    const token: string = account.auth_token;
    if (!token) throw new Error('The number account could not be authenticated.');
    // Use lineTokenFor's existing parent-authenticated lookup for this sub-account.
    // Do not require optional database encryption or persist a plaintext token.
    const { error: subError } = await database.from('tenant_twilio_lines').update({ subaccount_sid: sid, auth_token_enc: null }).eq('account_id', accountId);
    if (subError) throw new Error(subError.message);
    await request(`${API}/Accounts/${sid}/IncomingPhoneNumbers/${row.phone_sid}.json`, auth(parent.sid, parent.token), { SmsUrl: 'https://xellvio.com/api/public/twilio/inbound', SmsMethod: 'POST' });
    const verifications = await pages(`${TFV}?PageSize=50`, auth(sid, token), 'verifications');
    const verified = verifications.find(v => v.tollfree_phone_number_sid === row.phone_sid && isApprovedVerification(v.status));
    const status = verified ? 'active' : 'verification_pending';
    const now = new Date(); const renews = new Date(now); renews.setMonth(renews.getMonth() + 1);
    const { error: saveError } = await database.from('tenant_twilio_lines').update({ phone_number: row.phone_number, phone_sid: row.phone_sid, verification_sid: verified?.sid ?? null, status, status_detail: verified ? null : 'Number approval could not be confirmed yet. Sending remains unavailable until approval is confirmed.', billing_status: 'current', renews_at: line.renews_at ?? renews.toISOString(), updated_at: now.toISOString() }).eq('account_id', accountId);
    if (saveError) throw new Error(saveError.message);
    for (const country of ['US', 'CA', 'PR']) {
      const { error: assetError } = await database.from('sender_assets').upsert({ account_id: accountId, country_code: country, sender_kind: 'toll_free', phone_number: row.phone_number, is_shared: false, verification_status: verified ? 'verified' : 'pending', verified_at: verified ? now.toISOString() : null, last_synced_at: now.toISOString(), telnyx_phone_number_id: null, telnyx_messaging_profile_id: null }, { onConflict: 'account_id,country_code,sender_kind' });
      if (assetError) throw new Error(assetError.message);
    }
    const { error: inventoryError } = await database.from('twilio_verified_inventory').update({ owner_account_sid: sid, verification_sid: verified?.sid ?? null, verification_status: verified ? 'verified' : 'pending', assignment_state: 'assigned', last_error: null }).eq('phone_sid', row.phone_sid);
    if (inventoryError) throw new Error(inventoryError.message);
    const { error: accountError } = await database.from('accounts').update({ tollfree_setup_fee_due_cents: 0, tollfree_setup_fee_paid_at: now.toISOString() }).eq('id', accountId);
    if (accountError) throw new Error(accountError.message);
    return { phone_number: row.phone_number, country: 'US', status };
  } catch (e) {
    await database.from('twilio_verified_inventory').update({ assignment_state: 'setup_paused', last_error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq('phone_sid', row.phone_sid);
    throw e;
  } finally {
    await database.from('twilio_verified_inventory').update({ lease_until: null }).eq('phone_sid', row.phone_sid);
  }
}
export async function unassignTwilioInventory(phone: string) {
  const database = await db();
  const { data: row, error } = await database.from('twilio_verified_inventory').select('*').eq('phone_number', phone).single();
  if (error) throw new Error(error.message);
  if (!row.assigned_account_id) return;
  if (row.lease_until && new Date(row.lease_until) > new Date()) throw new Error('Wait for the assignment to finish before removing it.');
  // Keep the number at its current carrier account; disable sending and renewals before making it available again.
  const { error: lineError } = await database.from('tenant_twilio_lines').update({ status: 'released', renews_at: null }).eq('account_id', row.assigned_account_id).eq('phone_sid', row.phone_sid);
  if (lineError) throw new Error(lineError.message);
  const { error: assetError } = await database.from('sender_assets').delete().eq('account_id', row.assigned_account_id).eq('phone_number', phone);
  if (assetError) throw new Error(assetError.message);
  const { error: saveError } = await database.from('twilio_verified_inventory').update({ assigned_account_id: null, assignment_state: 'available', last_error: null }).eq('phone_sid', row.phone_sid);
  if (saveError) throw new Error(saveError.message);
}