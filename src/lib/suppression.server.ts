// Single source of truth for "this number opted out — never text it again".
//
// Campaign planning already excludes suppressed numbers in SQL, but opt-outs
// were only recorded when the phone matched a saved contact row, and one-off
// sends (test sends, inbox replies) never checked suppression at all.

export async function recordOptOut(args: {
  accountIds: Iterable<string>;
  phone: string;
  reason?: string;
  source?: string;
}): Promise<void> {
  const ids = Array.from(new Set(Array.from(args.accountIds).filter(Boolean)));
  if (ids.length === 0 || !args.phone) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = ids.map((account_id) => ({
    account_id,
    phone_e164: args.phone,
    reason: args.reason ?? "inbound_stop",
    source: args.source ?? "telnyx_inbound",
  }));
  const { error } = await (supabaseAdmin as any)
    .from("suppressions")
    .upsert(rows, { onConflict: "account_id,phone_e164" });
  if (error) console.error("[suppression] opt-out upsert failed", error);
}

export async function clearOptOut(args: { accountIds: Iterable<string>; phone: string }): Promise<void> {
  const ids = Array.from(new Set(Array.from(args.accountIds).filter(Boolean)));
  if (ids.length === 0 || !args.phone) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("suppressions")
    .delete()
    .in("account_id", ids)
    .eq("phone_e164", args.phone);
}

/** True when this account must not send SMS to this number. */
export async function isSuppressed(accountId: string, phone: string): Promise<boolean> {
  if (!accountId || !phone) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("suppressions")
    .select("id")
    .eq("account_id", accountId)
    .eq("phone_e164", phone)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export const OPT_OUT_BLOCK_MESSAGE =
  "This number opted out of your messages, so it can't be texted again. They must reply START from their phone to opt back in.";

/** Throws a user-facing error when the recipient opted out. */
export async function assertNotSuppressed(accountId: string, phone: string): Promise<void> {
  if (await isSuppressed(accountId, phone)) throw new Error(OPT_OUT_BLOCK_MESSAGE);
}
