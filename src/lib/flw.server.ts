// International card processor (server-only). Never name the provider in UI.
const BASE = "https://api.flutterwave.com/v3";

export function isCardProcessorConfigured(): boolean {
  return !!process.env["FLUTTERWAVE_SECRET_KEY"];
}

async function call(path: string, init?: RequestInit): Promise<any> {
  const key = process.env["FLUTTERWAVE_SECRET_KEY"];
  if (!key) throw new Error("Card payments are not configured");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  if (!res.ok || json?.status === "error") {
    console.error(`card processor ${path} [${res.status}]: ${text.slice(0, 500)}`);
    throw new Error(json?.message || `Card processor error (${res.status})`);
  }
  return json;
}

export async function createHostedPayment(opts: {
  reference: string;
  amountUsd: number;
  email: string;
  label: string;
  redirectUrl: string;
}): Promise<string> {
  const json = await call("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: opts.reference,
      amount: opts.amountUsd.toFixed(2),
      currency: "USD",
      redirect_url: opts.redirectUrl,
      payment_options: "card",
      customer: { email: opts.email },
      customizations: { title: "Xellvio", description: opts.label },
      meta: { reference: opts.reference },
    }),
  });
  const link = json?.data?.link as string | undefined;
  if (!link) throw new Error("Card checkout did not start — please try again.");
  return link;
}

export type VerifiedTx = { status: string; amount: number; currency: string; id: number } | null;

/** Authoritative lookup by our reference. Returns null if no transaction yet. */
export async function verifyByReference(reference: string): Promise<VerifiedTx> {
  try {
    const json = await call(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`);
    const d = json?.data;
    if (!d || d.tx_ref !== reference) return null;
    return { status: String(d.status), amount: Number(d.amount), currency: String(d.currency), id: d.id };
  } catch {
    return null;
  }
}
