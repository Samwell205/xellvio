// Lookup-only recovery for dedicated-line (SM…) messages whose final carrier
// receipt never arrived. Reads the message from the owning subaccount and
// replays it through the normal status handler. Never resends or charges.
import { mapTwilioStatus } from "./twilio-backup-routing";

const API = "https://api.twilio.com/2010-04-01";
const OPEN = ["sent", "accepted", "delivery_unconfirmed"];

/** Converts a carrier message lookup into the shared status-handler payload, or null if not final. */
export function twilioReceiptPayload(msg: { sid?: string; status?: string; error_code?: number | string | null }) {
  const status = mapTwilioStatus(msg?.status);
  if (!msg?.sid || (status !== "delivered" && status !== "delivery_failed")) return null;
  const errors = status === "delivery_failed"
    ? [{ code: msg.error_code ? `TW${msg.error_code}` : "TW_FAILED", detail: "Recipient network did not deliver the message." }]
    : [];
  return { data: { event_type: "message.finalized", payload: { id: msg.sid, to: [{ status, errors }] } } };
}

async function authForSender(db: any, sender: string, cache: Map<string, string | null>) {
  if (cache.has(sender)) return cache.get(sender)!;
  const { lineTokenFor } = await import("./twilio-lines.server");
  const { data } = await db.from("tenant_twilio_lines").select("subaccount_sid").eq("phone_number", sender).not("subaccount_sid", "is", null).limit(1).maybeSingle();
  let auth: string | null = null;
  if (data?.subaccount_sid) {
    const tok = await lineTokenFor(data.subaccount_sid);
    if (tok) auth = `${data.subaccount_sid}|Basic ${Buffer.from(`${data.subaccount_sid}:${tok}`).toString("base64")}`;
  }
  cache.set(sender, auth);
  return auth;
}

/** Recovers up to `limit` open dedicated-line messages; optional campaign scope and id cursor. */
export async function recoverTwilioReceipts(db: any, opts: { campaignId?: string; after?: string; olderThanMin?: number; maxAgeHours?: number; limit?: number; budgetMs?: number }) {
  let q = db.from("messages").select("id,provider_message_id,sender_used")
    .in("status", OPEN).ilike("provider_message_id", "SM%").not("sender_used", "is", null)
    .order("id", { ascending: true }).limit(opts.limit ?? 120);
  if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
  if (opts.after) q = q.gt("id", opts.after);
  if (opts.olderThanMin) q = q.lte("sent_at", new Date(Date.now() - opts.olderThanMin * 60_000).toISOString());
  if (opts.maxAgeHours) q = q.gte("sent_at", new Date(Date.now() - opts.maxAgeHours * 3_600_000).toISOString());
  const { data, error } = await q;
  if (error) throw new Error("Could not load delivery receipts. Please retry.");
  const rows = data ?? [];
  const { handleStatus } = await import("@/routes/api.public.telnyx-status");
  const cache = new Map<string, string | null>();
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  let checked = 0, updated = 0, errors = 0, stillAwaiting = 0, nextCursor = opts.after ?? null;
  for (let i = 0; i < rows.length && Date.now() < deadline; i += 6) {
    const chunk = rows.slice(i, i + 6);
    await Promise.all(chunk.map(async (row: any) => {
      checked++;
      try {
        const auth = await authForSender(db, row.sender_used, cache);
        if (!auth) { stillAwaiting++; return; }
        const [sid, header] = auth.split("|");
        const res = await fetch(`${API}/Accounts/${sid}/Messages/${row.provider_message_id}.json`, { headers: { Authorization: header }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) { errors++; return; }
        const payload = twilioReceiptPayload(await res.json());
        if (!payload) { stillAwaiting++; return; }
        await handleStatus(payload);
        updated++;
      } catch { errors++; }
    }));
    nextCursor = chunk[chunk.length - 1]?.id ?? nextCursor;
  }
  return { checked, updated, errors, stillAwaiting, nextCursor, done: checked === rows.length && rows.length < (opts.limit ?? 120) };
}
