import type { DnsRecord } from "./email-domain-rules";

const API = "https://api.sendgrid.com/v3";

function key() {
  const k = process.env["SENDGRID_API_KEY"];
  if (!k) throw new Error("Email sending is not configured yet.");
  return k;
}

async function sg(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    console.error(`Email provider ${path} failed [${res.status}]: ${text}`);
    const msg = body?.errors?.[0]?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

type ProviderDns = Record<string, { host: string; type: string; data: string; valid: boolean }>;

function toRecords(dns: ProviderDns | undefined): DnsRecord[] {
  return Object.values(dns ?? {}).map((r) => ({ type: r.type.toUpperCase(), host: r.host, value: r.data, valid: !!r.valid }));
}

/** Find an existing authenticated domain for this exact domain, or create one. */
export async function createOrFindDomain(domain: string) {
  const existing: any[] = (await sg(`/whitelabel/domains?domain=${encodeURIComponent(domain)}&limit=50`)) ?? [];
  const match = existing.find((d) => d.domain === domain);
  const d = match ?? (await sg("/whitelabel/domains", {
    method: "POST",
    body: JSON.stringify({ domain, automatic_security: true, custom_spf: false, default: false }),
  }));
  return { id: Number(d.id), valid: !!d.valid, records: toRecords(d.dns) };
}

/** Ask the provider to look up the DNS records now. */
export async function validateDomain(id: number) {
  await sg(`/whitelabel/domains/${id}/validate`, { method: "POST" });
  const d = await sg(`/whitelabel/domains/${id}`);
  return { valid: !!d.valid, records: toRecords(d.dns) };
}
