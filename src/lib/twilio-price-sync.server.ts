// Records Twilio's actual billed price on each finalized message so admin
// campaign reports show real carrier cost. Read-only lookup: never resends,
// never changes tenant balances.
const API = "https://api.twilio.com/2010-04-01";
const FINAL = ["delivered", "undelivered", "failed", "delivery_unconfirmed"];

/** Twilio reports price as a negative string (e.g. "-0.00830"); returns the positive cost or null. */
export function parseTwilioPrice(price: unknown): number | null {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

export async function syncTwilioPrices(db: any, opts: { limit?: number; budgetMs?: number } = {}) {
  const parentSid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!parentSid || !token) return { checked: 0, priced: 0, errors: 0, skipped: "no_credentials" };
  const auth = `Basic ${Buffer.from(`${parentSid}:${token}`).toString("base64")}`;

  const { data, error } = await db.from("messages")
    .select("id,provider_message_id,sender_used,status,sent_at")
    .is("carrier_price_checked_at", null).ilike("provider_message_id", "SM%")
    .in("status", FINAL).order("id", { ascending: true }).limit(opts.limit ?? 600);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];

  // Owning subaccount per sender (parent credentials can read subaccounts).
  const senders = [...new Set(rows.map((r) => r.sender_used).filter(Boolean))];
  const subBySender = new Map<string, string>();
  if (senders.length) {
    const { data: lines } = await db.from("tenant_twilio_lines").select("phone_number,subaccount_sid").in("phone_number", senders).not("subaccount_sid", "is", null);
    for (const l of lines ?? []) subBySender.set(l.phone_number, l.subaccount_sid);
  }

  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  let checked = 0, priced = 0, errors = 0;
  for (let i = 0; i < rows.length && Date.now() < deadline; i += 10) {
    await Promise.all(rows.slice(i, i + 10).map(async (row) => {
      checked++;
      try {
        const sid = subBySender.get(row.sender_used) ?? parentSid;
        const res = await fetch(`${API}/Accounts/${sid}/Messages/${row.provider_message_id}.json`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) });
        const ageH = row.sent_at ? (Date.now() - new Date(row.sent_at).getTime()) / 3_600_000 : 999;
        if (!res.ok) {
          errors++;
          // Give up on unreadable messages after 3 days so the queue keeps moving.
          if (res.status === 404 || ageH > 72) await db.from("messages").update({ carrier_price_checked_at: new Date().toISOString() }).eq("id", row.id);
          return;
        }
        const price = parseTwilioPrice((await res.json())?.price);
        if (price === null && ageH < 72) return; // Twilio hasn't priced it yet
        await db.from("messages").update({ carrier_price: price, carrier_price_checked_at: new Date().toISOString() }).eq("id", row.id);
        if (price !== null) priced++;
      } catch { errors++; }
    }));
  }
  return { checked, priced, errors };
}
