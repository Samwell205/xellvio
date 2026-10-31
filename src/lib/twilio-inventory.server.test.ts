import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ ownerSid: 'ACoriginal', updates: [] as { table: string; value: Record<string, unknown> }[], rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  rpc: state.rpc,
  from: (table: string) => {
    const query: any = {
      select: () => query, eq: () => query,
      update: (value: Record<string, unknown>) => { state.updates.push({ table, value }); return query; },
      upsert: () => query,
      maybeSingle: async () => ({ data: { owner_account_sid: state.ownerSid, phone_number: '+18553820888' }, error: null }),
      single: async () => ({ data: table === 'accounts' ? { id: 'tenant', onboarding_status: 'active', sending_suspended_at: null } : { renews_at: '2026-12-01T00:00:00Z' }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    return query;
  },
} }));
import { assignTwilioInventory } from './twilio-inventory.server';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); state.updates.length = 0; state.ownerSid = 'ACoriginal'; });
describe('approved inventory assignment recovery', () => {
  it('rejects main-account numbers before reserving or charging', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACparent');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token');
    state.ownerSid = 'ACparent';
    await expect(assignTwilioInventory('tenant', '+18553820888', 100)).rejects.toThrow('reserved for the platform');
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });
  it('resumes without token encryption, moving the number or resetting renewal', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACparent');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token');
    state.rpc.mockImplementation(async (name: string) => {
      if (name === 'reserve_twilio_inventory') return { data: { phone_sid: 'PNnumber', phone_number: '+18553820888', owner_account_sid: 'ACoriginal' }, error: null };
      if (name === 'lease_twilio_inventory') return { data: true, error: null };
      throw new Error('encryption key not configured');
    });
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('Verifications') ? { verifications: [{ tollfree_phone_number_sid: 'PNnumber', sid: 'HHapproved', status: 'TWILIO_APPROVED' }] }
      : url.endsWith('/Accounts/ACoriginal.json') ? { auth_token: 'test-sub-token' } : { account_sid: 'ACoriginal' }
    ), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await assignTwilioInventory('tenant', '+18553820888')).toEqual({ phone_number: '+18553820888', country: 'US', status: 'active' });
    expect(state.rpc.mock.calls.map(call => call[0])).toEqual(['reserve_twilio_inventory', 'lease_twilio_inventory']);
    expect(state.rpc).toHaveBeenCalledWith('reserve_twilio_inventory', { _account_id: 'tenant', _phone_number: '+18553820888', _price: 0 });
    expect(state.updates).toContainEqual({ table: 'tenant_twilio_lines', value: { subaccount_sid: 'ACoriginal', auth_token_enc: null } });
    const active = state.updates.find(update => update.table === 'tenant_twilio_lines' && update.value.status === 'active');
    expect(active?.value.renews_at).toBe('2026-12-01T00:00:00Z');
    for (const call of fetchMock.mock.calls) {
      const options = (call as unknown as [string, RequestInit])[1];
      if (options?.body instanceof URLSearchParams) expect(options.body.has('AccountSid')).toBe(false);
    }
    expect(state.updates).toContainEqual({ table: 'twilio_verified_inventory', value: { owner_account_sid: 'ACoriginal', verification_sid: 'HHapproved', verification_status: 'verified', assignment_state: 'assigned', last_error: null } });
  });
});