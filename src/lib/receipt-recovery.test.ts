import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMessage } from './telnyx.server';
import { receiptUpdate } from './receipt-recovery.server';
import { SECONDARY_WORKSPACE_ID } from './telnyx-connection';

const state = vi.hoisted(() => ({ missing: false }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: async () => ({
    data: state.missing ? null : { sent_at: '2026-10-20T22:30:00Z', phone_e164: '+14155550123', campaigns: { account_id: SECONDARY_WORKSPACE_ID } },
  }) }) }) }) }),
} }));
afterEach(() => { state.missing = false; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('receipt-only recovery', () => {
  it('recovers from the other connection on 404 using GET only', async () => {
    vi.stubEnv('TELNYX_API_KEY', 'test-original'); vi.stubEnv('TELNYX_SECONDARY_INACTIVE_API_KEY', 'test-additional');
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ code: '40303' }] }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'message-1', to: [{ status: 'delivered' }] } })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getMessage('message-1', true)).toMatchObject({ id: 'message-1' });
    expect(fetchMock.mock.calls.map(c => c[1].method)).toEqual(['GET', 'GET']);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-original');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-additional');
  });
  it('does not mask authorization failures by trying another connection', async () => {
    vi.stubEnv('TELNYX_API_KEY', 'test-original'); vi.stubEnv('TELNYX_SECONDARY_INACTIVE_API_KEY', 'test-additional');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 })); vi.stubGlobal('fetch', fetchMock);
    await expect(getMessage('message-1', true)).rejects.toThrow(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('refuses to guess a connection if message ownership cannot be resolved', async () => {
    state.missing = true; const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(getMessage('message-1', true)).rejects.toThrow('could not be resolved'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not turn sent or unknown states into delivery or failure', () => {
    expect(receiptUpdate({ to: [{ status: 'sent' }] })).toBeNull();
    expect(receiptUpdate({ to: [{ status: 'new_unknown_state' }] })).toBeNull();
  });
  it('clears stale failure markers only on a confirmed delivered receipt', () => {
    expect(receiptUpdate({ to: [{ status: 'delivered' }] })).toMatchObject({ status: 'delivered', error_code: null, failure_reason: null });
  });
  it('retains explicit rejection evidence without any price or charge mutation', () => {
    expect(receiptUpdate({ to: [{ status: 'delivery_failed', errors: [{ code: '40008', detail: 'Rejected' }] }] }))
      .toEqual({ status: 'undelivered', error_code: '40008', failure_reason: 'Rejected' });
  });
});