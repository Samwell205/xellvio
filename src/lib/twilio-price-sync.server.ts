// Records Twilio's actual billed price on each finalized message so admin
// campaign reports show real carrier cost. Read-only lookup: never resends,
// never changes tenant balances.
const API = "https://api.twilio.com/2010-04-01";
const FINAL = ["sent", "accepted", "delivered", "undelivered", "failed", "delivery_unconfirmed"];

/** Twilio reports price as a negative string (e.g. "-0.00830"); returns the positive cost or null. */
export function parseTwilioPrice(price: unknown): number | null {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

export function verifiedPricePatch(row: { id: string; provider_message_id: string }, message: { sid?: string; price?: unknown; price_unit?: string }) {
  const price = parseTwilioPrice(message.price);
  if (message.sid !== row.provider_message_id || message.price_unit?.toUpperCase() !== "USD" || price === null) return null;
  return { id: row.id, provider_message_id: row.provider_message_id, carrier_price: price };
}

export async function syncTwilioPrices(db: any, opts: { limit?: number; budgetMs?: number } = {}) {
  const parentSid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!parentSid || !token) return { checked: 0, priced: 0, errors: 0, skipped: "no_credentials" };
  const auth = `Basic ${Buffer.from(`${parentSid}:${token}`).toString("base64")}`;

  const { data, error } = await db.from("messages")
    .select("id,provider_message_id,sender_used,status,sent_at")
    .is("carrier_price", null).ilike("provider_message_id", "SM%")
    .in("status", FINAL).order("carrier_price_checked_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true }).limit(opts.limit ?? 600);
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
  const { lineTokenFor } = await import("./twilio-lines.server");
  const tokens = new Map<string, string>();
  await Promise.all([...new Set(subBySender.values())].map(async (sid) => {
    const token = await lineTokenFor(sid);
    if (token) tokens.set(sid, `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`);
  }));
  let checked = 0, priced = 0, errors = 0;
  for (let i = 0; i < rows.length && Date.now() < deadline; i += 6) {
    await Promise.all(rows.slice(i, i + 6).map(async (row) => {
      checked++;
      try {
        const sid = subBySender.get(row.sender_used) ?? parentSid;
        const res = await fetch(`${API}/Accounts/${sid}/Messages/${row.provider_message_id}.json`, { headers: { Authorization: tokens.get(sid) ?? auth }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
          errors++;
          await db.from("messages").update({ carrier_price_checked_at: new Date().toISOString() }).eq("id", row.id);
          return;
        }
        const patch = verifiedPricePatch(row, await res.json());
        const { error: updateError } = await db.from("messages").update({ ...(patch ? { carrier_price: patch.carrier_price } : {}), carrier_price_checked_at: new Date().toISOString() }).eq("id", row.id).eq("provider_message_id", row.provider_message_id);
        if (updateError) throw new Error(updateError.message);
        if (patch) priced++;
      } catch { errors++; }
    }));
  }
  return { checked, priced, errors };
}

/** Campaign-scoped bulk lookup: list pages only, never submits SMS or changes wallets. */
export async function recoverCampaignPricePage(db: any, campaignId: string, after?: string, pageToken?: string) {
  const { data: rows, error } = await db.from("messages")
    .select("id,provider_message_id,sender_used,sent_at")
    .eq("campaign_id", campaignId).ilike("provider_message_id", "SM%")
    .order("id", { ascending: true }).limit(1).gt("id", after ?? "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
  const row = rows?.[0];
  if (!row) return { checked: 0, priced: 0, done: true, after: null, pageToken: null };
  const { data: line } = await db.from("tenant_twilio_lines").select("subaccount_sid").eq("phone_number", row.sender_used).limit(1).maybeSingle();
  const sid = line?.subaccount_sid;
  if (!sid) throw new Error("The sending number's price connection is unavailable.");
  const { lineTokenFor } = await import("./twilio-lines.server");
  const token = await lineTokenFor(sid);
  if (!token) throw new Error("The sending number's price connection is unavailable.");
  const day = String(row.sent_at).slice(0, 10);
  const params = new URLSearchParams({ From: row.sender_used, DateSent: day, PageSize: "1000" });
  if (pageToken) params.set("PageToken", pageToken);
  const res = await fetch(`${API}/Accounts/${sid}/Messages.json?${params}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` }, signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Message price lookup unavailable (${res.status}).`);
  const result = await res.json();
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const ids = messages.map((m: any) => m.sid).filter((v: unknown) => typeof v === "string");
  let priced = 0;
  if (ids.length) {
    const { data: matches, error: matchError } = await db.from("messages").select("id,provider_message_id")
      .eq("campaign_id", campaignId).in("provider_message_id", ids).is("carrier_price", null).limit(1000);
    if (matchError) throw new Error(matchError.message);
    const bySid = new Map(messages.map((m: any) => [m.sid, m]));
    const patches = (matches ?? []).map((m: any) => verifiedPricePatch(m, bySid.get(m.provider_message_id) as any)).filter(Boolean);
    if (patches.length) {
      const { data: count, error: saveError } = await db.rpc("record_campaign_carrier_prices", { _campaign_id: campaignId, _rows: patches });
      if (saveError) throw new Error(saveError.message);
      priced = Number(count ?? 0);
    }
  }
  const nextToken = result.next_page_uri ? new URL(result.next_page_uri, "https://api.twilio.com").searchParams.get("PageToken") : null;
  if (nextToken) return { checked: messages.length, priced, done: false, after: after ?? null, pageToken: nextToken };
  // Advance past every campaign row from this sender/day, then process another group.
  const { data: end } = await db.from("messages").select("id").eq("campaign_id", campaignId)
    .eq("sender_used", row.sender_used).gte("sent_at", `${day}T00:00:00Z`).lt("sent_at", `${day}T23:59:59.999999Z`)
    .ilike("provider_message_id", "SM%").order("id", { ascending: false }).limit(1).maybeSingle();
  return { checked: messages.length, priced, done: false, after: end?.id ?? row.id, pageToken: null };
}
