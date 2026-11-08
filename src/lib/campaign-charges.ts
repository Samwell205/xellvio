// Campaign "Charged" totals come from the wallet ledger (debits minus refunds),
// so the campaign page always matches what actually left the tenant's balance.
type LedgerRow = { type: string | null; amount: number | string | null };

export function netCampaignCharge(rows: LedgerRow[]): { debited: number; refunded: number; net: number; hasLedger: boolean } {
  let debited = 0;
  let refunded = 0;
  for (const r of rows) {
    const a = Number(r.amount ?? 0);
    if (r.type === "debit") debited += a;
    else if (r.type === "refund") refunded += a;
  }
  const round = (n: number) => +n.toFixed(4);
  return { debited: round(debited), refunded: round(refunded), net: round(debited - refunded), hasLedger: rows.length > 0 };
}

export async function fetchCampaignCharge(client: any, campaignId: string) {
  const rows: LedgerRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await client
      .from("credit_transactions")
      .select("type,amount")
      .eq("campaign_id", campaignId)
      .in("type", ["debit", "refund"])
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return netCampaignCharge(rows);
}
