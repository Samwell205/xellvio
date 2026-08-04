// Shared retry pricing/preflight helper.
//
// Historically a picture message (MMS) was priced as `segments x rate x MMS
// multiplier`, which overcharged tenants. An MMS is ONE billable message with
// an attachment and has no SMS segments. Any row that is re-queued for another
// send attempt therefore has to be re-priced from the live rate card before it
// goes back out, otherwise a resend would repeat the old wrong charge.
//
// It also answers the question a tenant actually cares about before hitting
// "resend": how much will this cost, and do I have enough credit?

const MMS_COUNTRIES = new Set(["US", "CA"]);

export type RetryPreflight = {
  count: number;
  estimatedCost: number;
  balance: number;
  shortfall: number;
  isMms: boolean;
  /** message id -> corrected cost, grouped for cheap bulk updates */
  costGroups: Array<{ cost: number; segments: number; isMms: boolean; ids: string[] }>;
};

export async function priceRetryRows(
  supabaseAdmin: any,
  campaign: { id: string; account_id: string; media_url?: string | null },
  ids: string[],
): Promise<RetryPreflight> {
  const hasMedia = !!campaign.media_url;

  const [{ data: rates }, { data: rows }, { data: account }] = await Promise.all([
    supabaseAdmin.from("country_rates").select("country_code,sell_price,mms_multiplier"),
    ids.length
      ? supabaseAdmin.from("messages").select("id,country_code,segments_count").in("id", ids)
      : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from("accounts").select("credit_balance").eq("id", campaign.account_id).maybeSingle(),
  ]);

  const rateByCc = new Map<string, { unit: number; mult: number }>(
    (rates ?? []).map((r: any) => [r.country_code, { unit: Number(r.sell_price ?? 0), mult: Number(r.mms_multiplier ?? 3) }]),
  );

  const groups = new Map<string, { cost: number; segments: number; isMms: boolean; ids: string[] }>();
  let estimatedCost = 0;
  let anyMms = false;

  for (const r of (rows ?? []) as any[]) {
    const cc = r.country_code ?? "";
    const rate = rateByCc.get(cc);
    const isMms = hasMedia && MMS_COUNTRIES.has(cc);
    const segments = isMms ? 1 : Math.max(1, Number(r.segments_count ?? 1));
    const cost = rate
      ? isMms
        ? +(rate.unit * rate.mult).toFixed(4)
        : +(segments * rate.unit).toFixed(4)
      : 0;
    if (isMms) anyMms = true;
    estimatedCost += cost;
    const key = `${cost}|${segments}|${isMms}`;
    const g = groups.get(key) ?? { cost, segments, isMms, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }

  const balance = Number((account as any)?.credit_balance ?? 0);
  estimatedCost = +estimatedCost.toFixed(4);

  return {
    count: (rows ?? []).length,
    estimatedCost,
    balance,
    shortfall: +Math.max(0, estimatedCost - balance).toFixed(4),
    isMms: anyMms,
    costGroups: Array.from(groups.values()),
  };
}

/** Write the corrected price/segment count back onto the rows being re-queued. */
export async function applyRetryPricing(supabaseAdmin: any, preflight: RetryPreflight) {
  for (const g of preflight.costGroups) {
    if (g.ids.length === 0) continue;
    await supabaseAdmin
      .from("messages")
      .update({ cost: g.cost, segments_count: g.segments, is_mms: g.isMms })
      .in("id", g.ids);
  }
}
