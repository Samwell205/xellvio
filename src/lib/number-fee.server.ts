// Charges a one-time phone-number / verification fee against an account's
// credit balance. Idempotent per marker — if the same marker has already been
// debited for that account, we don't charge again (so retrying a rejected
// toll-free submission, for example, doesn't keep costing).

export const NUMBER_VERIFICATION_FEE_USD = 5;
export const TOLLFREE_VERIFICATION_FEE_USD = 3.5;

export async function chargeNumberVerificationFee(opts: {
  accountId: string;
  marker: string; // unique identifier of what this fee is for
  amount?: number; // override the default $5 fee
  description: string;
}): Promise<{ charged: boolean; alreadyPaid: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Check if this marker already paid.
  const tag = `[number-fee:${opts.marker}]`;
  const { data: existing } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("account_id", opts.accountId)
    .eq("type", "debit")
    .ilike("description", `%${tag}%`)
    .limit(1)
    .maybeSingle();
  if (existing) return { charged: false, alreadyPaid: true };

  // Check balance.
  const { data: acct, error: aErr } = await supabaseAdmin
    .from("accounts")
    .select("credit_balance")
    .eq("id", opts.accountId)
    .single();
  if (aErr) throw new Error(aErr.message);
  const bal = Number(acct?.credit_balance ?? 0);
  if (bal < NUMBER_VERIFICATION_FEE_USD) {
    throw new Error(
      `Insufficient credit balance. A one-time $${NUMBER_VERIFICATION_FEE_USD} phone-number fee is required — please top up and try again.`,
    );
  }

  const { error: rpcErr } = await supabaseAdmin.rpc("debit_account", {
    _account_id: opts.accountId,
    _amount: NUMBER_VERIFICATION_FEE_USD,
    _campaign_id: null as any,
    _description: `${opts.description} ${tag}`,
  });
  if (rpcErr) throw new Error(rpcErr.message);
  return { charged: true, alreadyPaid: false };
}
