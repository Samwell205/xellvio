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

  for (const c of paused) {
    const { data: recipients } = await supabaseAdmin.rpc("eligible_profile_ids", {
      _account_id: c.account_id,
      _audience: c.audience ?? { include: [], exclude: [] },
    });
    const list = (recipients ?? []) as any[];
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
