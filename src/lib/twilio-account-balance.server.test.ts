import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTwilioAccountBalance } from './twilio-account-balance.server';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setup(body: unknown, status = 200) {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACfunded');
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token');
  const request = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', request);
  return request;
}
describe('funded Twilio account balance', () => {
  it('reads the funded parent rather than an obsolete carrier or subaccount', async () => {
    const request = setup({ account_sid: 'ACfunded', balance: '42.125', currency: 'usd' });
    expect(await fetchTwilioAccountBalance()).toEqual({ ok: true, balance: 42.125, currency: 'USD' });
    expect(request).toHaveBeenCalledWith('https://api.twilio.com/2010-04-01/Accounts/ACfunded/Balance.json', expect.objectContaining({ headers: { Authorization: `Basic ${Buffer.from('ACfunded:test-token').toString('base64')}` } }));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not treat a refused lookup as a confirmed zero balance', async () => {
    setup({ message: 'Unauthorized' }, 401);
    expect(await fetchTwilioAccountBalance()).toMatchObject({ ok: false, error: 'Twilio balance request failed (401).' });
  });
  it('rejects a different account balance', async () => {
    setup({ account_sid: 'ACother', balance: '100', currency: 'USD' });
    expect(await fetchTwilioAccountBalance()).toMatchObject({ ok: false });
  });
  it.each([undefined, null, '', 'not-a-number'])('rejects invalid balances: %s', async balance => {
    setup({ account_sid: 'ACfunded', balance, currency: 'USD' });
    expect(await fetchTwilioAccountBalance()).toMatchObject({ ok: false });
  });
  it('does not fall back to another account when credentials are absent', async () => {
    const request = setup({});
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    expect(await fetchTwilioAccountBalance()).toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();
  });
});