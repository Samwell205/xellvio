// Currency formatting — always USD, never says "credits" in UI.
export function formatUSD(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function formatPerSms(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  // 4-decimal precision for per-segment unit prices, trimming if cleanly 3 decimals
  const fixed = v.toFixed(4);
  return `$${fixed} per SMS`;
}

export function formatRate(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return `$${v.toFixed(4)}`;
}
