// Auto-resume campaigns paused due to low master Twilio balance.
// Flips paused_low_balance → queued for the oldest paused campaigns whenever
// there is any safe sending capacity. The dispatcher itself caps each batch to
// the remaining provider budget, so large campaigns can make partial progress
// instead of waiting until the provider balance can cover the full campaign.

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
  let remainingBalance = balance - buffer;
  const resumed: string[] = [];
  if (remainingBalance <= 0) return [];

  for (const c of paused) {
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "queued", paused_reason: null, paused_at: null })
      .eq("id", c.id);
    resumed.push(c.id);
    // Let one campaign resume per balance check. This prevents a low provider
    // balance from waking every paused tenant at once; the dispatcher will pause
    // again after spending the safe capacity.
    break;
  }

  return resumed;
}
