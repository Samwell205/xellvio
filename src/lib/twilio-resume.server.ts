// Auto-resume campaigns paused due to low master Twilio balance.
// Flips paused_low_balance → queued for the oldest paused campaigns, only
// while there is enough Twilio balance + safety buffer to cover them.

export async function resumePausedCampaigns(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getMasterTwilioBalance, getBalanceBuffer } = await import("./twilio-alerts.server");

  const { data: paused } = await supabaseAdmin
    .from("campaigns")
    .select("id, account_id, audience, message_body, media_url")
    .eq("status", "paused_low_balance")
    .order("paused_at", { ascending: true });

  if (!paused || paused.length === 0) return [];

  const { balance, ok } = await getMasterTwilioBalance();
  if (!ok) return [];
  const buffer = await getBalanceBuffer();

  // Load active rate sheet once
  const { data: ratesRows } = await supabaseAdmin
    .from("country_rates")
    .select("country_code,dial_prefix,sell_price,mms_multiplier,active")
    .eq("active", true);
  const rates = (ratesRows ?? []) as any[];
  const rateByCC: Record<string, any> = {};
  for (const r of rates) rateByCC[r.country_code] = r;

  const { calculateSegments } = await import("./sms-segments");
  const { countryFromPhone } = await import("./country-from-phone");
  const dial = rates.map((r) => ({ country_code: r.country_code, dial_prefix: r.dial_prefix }));

  let remainingBalance = balance - buffer;
  const resumed: string[] = [];

  async function loadEligibleRecipients(accountId: string, audience: any): Promise<any[]> {
    const { count } = await supabaseAdmin.rpc("eligible_profile_count", {
      _account_id: accountId,
      _audience: audience,
    });
    const PAGE = 1000;
    const total = Number(count ?? 0);
    const recipients: any[] = [];
    for (let offset = 0; offset < total; offset += PAGE) {
      const { data } = await supabaseAdmin.rpc("eligible_profile_ids_page", {
        _account_id: accountId,
        _audience: audience,
        _limit: PAGE,
        _offset: offset,
      });
      recipients.push(...(data ?? []));
    }
    return recipients;
  }

  for (const c of paused) {
    const list = await loadEligibleRecipients(c.account_id, c.audience ?? { include: [], exclude: [] });
    const hasMedia = !!c.media_url;
    let cost = 0;
    for (const p of list) {
      const seg = calculateSegments(c.message_body ?? "");
      const cc = p.country_code || countryFromPhone(p.phone_e164, dial);
      const rate = cc ? rateByCC[cc] : undefined;
      const unit = rate ? Number(rate.sell_price) : 0;
      const mult = hasMedia && rate ? Number(rate.mms_multiplier) : 1;
      cost += seg.segments * unit * mult;
    }
    cost = +cost.toFixed(4);
    if (cost > remainingBalance) {
      // Not enough headroom — stop unpausing further campaigns.
      break;
    }
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "queued", paused_reason: null, paused_at: null })
      .eq("id", c.id);
    remainingBalance -= cost;
    resumed.push(c.id);
  }

  return resumed;
}
