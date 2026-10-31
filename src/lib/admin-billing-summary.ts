type Account = { id: string; legal_business_name: string | null; contact_email: string | null; email: string | null; credit_balance: number | null; created_at: string };
type Totals = { account_id: string; funded?: number | string; funded_payments?: number | string; spent?: number | string; refunded?: number | string };

/** Saved ledger totals plus current wallets; never derive balances from cached totals. */
export function billingSummaryRows(accounts: Account[], totals: Totals[]) {
  const byAccount = new Map(totals.map(row => [row.account_id, row]));
  return accounts.map(account => {
    const row = byAccount.get(account.id);
    return {
      id: account.id,
      name: account.legal_business_name ?? account.contact_email ?? account.email ?? '—',
      email: account.contact_email ?? account.email ?? '',
      balance: Number(account.credit_balance ?? 0),
      paid_usd: Number(row?.funded ?? 0),
      payments_count: Number(row?.funded_payments ?? 0),
      spent: Number(row?.spent ?? 0),
      refunded: Number(row?.refunded ?? 0),
      created_at: account.created_at,
    };
  });
}