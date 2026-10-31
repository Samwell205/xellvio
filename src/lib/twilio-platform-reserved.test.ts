import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendViaLine } from './twilio-lines.server';
import { sendViaTwilio } from './twilio-backup.server';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('main-account numbers are platform-only', () => {
  it('never sends a tenant message from a main-account line', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACmain');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(sendViaLine({ sid: 'ACmain', token: 'test', from: '+18664725941' }, { to: '+15551234567', text: 'test' })).rejects.toThrow('reserved for the platform');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never sends through the legacy main-account backup', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(sendViaTwilio({ from: '+18664725941', to: '+15551234567', text: 'test' })).rejects.toThrow('Platform-reserved');
    expect(fetch).not.toHaveBeenCalled();
  });
});