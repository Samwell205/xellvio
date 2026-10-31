/** Read the funded parent account; its balance covers its number sub-accounts. */
export async function fetchTwilioAccountBalance(): Promise<{ ok: boolean; balance: number; currency: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const unavailable = (error: string) => ({ ok: false, balance: 0, currency: 'USD', error });
  if (!sid || !token) return unavailable('Twilio balance credentials are not configured.');
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Balance.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`[twilio-balance] request failed (${response.status}): ${body}`);
      return unavailable(`Twilio balance request failed (${response.status}).`);
    }
    const data = await response.json() as { account_sid?: string; balance?: unknown; currency?: unknown };
    const balance = typeof data.balance === 'string' || typeof data.balance === 'number' ? Number(data.balance) : NaN;
    if (data.account_sid !== sid || data.balance === '' || !Number.isFinite(balance) || typeof data.currency !== 'string' || !/^[a-z]{3}$/i.test(data.currency)) {
      return unavailable('Twilio returned an invalid account balance.');
    }
    return { ok: true, balance, currency: data.currency.toUpperCase() };
  } catch (error) {
    console.error('[twilio-balance] balance check unavailable', error);
    return unavailable('Twilio balance could not be checked. Please retry.');
  }
}