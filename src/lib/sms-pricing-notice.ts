import { resolveRecipientCountry, type DialEntry } from './country-from-phone';

export type NoticeRate = DialEntry & { sell_price: number | string };
export function noticePrice(rates: NoticeRate[], phone: string, count = 1000): number {
  const country = resolveRecipientCountry('US', phone, rates);
  const rate = rates.find((r) => r.country_code === country);
  if (!rate || !Number.isFinite(Number(rate.sell_price))) throw new Error('SMS price unavailable');
  return Number((Number(rate.sell_price) * count).toFixed(4));
}

export function uniqueNoticeRecipients<T extends { email: string | null }>(rows: T[], suppressed: string[]): T[] {
  const seen = new Set(suppressed.map((email) => email.trim().toLowerCase()));
  return rows.filter((row) => {
    const email = row.email?.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}