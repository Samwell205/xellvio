/** Normalise what a business types ("https://www.Acme.com/") into a bare domain, or null if invalid. */
export function normalizeSendingDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)) return null;
  return v;
}

export type DnsRecord = { type: string; host: string; value: string; valid: boolean };
