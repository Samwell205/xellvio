const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPALL"];
const RESUB_WORDS = ["START", "UNSTOP", "YES"];

type OutboundCandidate = {
  accountId: string;
  sender: string | null;
  createdAt: string;
};

function newestFirst(a: OutboundCandidate, b: OutboundCandidate) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export async function handleTelnyxInboundMessage(payload: any) {
  const p = payload?.data?.payload ?? {};
  const from: string | undefined = p?.from?.phone_number;
  const to: string | undefined = Array.isArray(p?.to) ? p.to[0]?.phone_number : undefined;
  const bodyText: string = (p?.text ?? "").trim();
  const providerSid: string | null = p?.id ?? null;
  if (!from) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const numberOwners = new Set<string>();
  if (to) {
    const { data: assets } = await admin
      .from("sender_assets")
      .select("account_id")
      .eq("phone_number", to);
    for (const a of assets ?? []) numberOwners.add(a.account_id);

    const { data: numRows } = await admin
      .from("numbers")
      .select("account_id")
      .eq("phone_number", to);
    for (const n of numRows ?? []) numberOwners.add(n.account_id);
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, account_id")
    .eq("phone_e164", from);

  const upper = bodyText.toUpperCase();
  if (STOP_WORDS.includes(upper)) {
    for (const pr of profiles ?? []) {
      await admin.from("consents").upsert({
        profile_id: pr.id,
        channel: "sms",
        status: "unsubscribed",
        source: "inbound_stop",
        consented_at: new Date().toISOString(),
      }, { onConflict: "profile_id,channel" });
      await admin.from("suppressions").upsert({
        account_id: pr.account_id,
        phone_e164: from,
        reason: "inbound_stop",
        source: "telnyx_inbound",
      }, { onConflict: "account_id,phone_e164" });
    }
  } else if (RESUB_WORDS.includes(upper)) {
    for (const pr of profiles ?? []) {
      await admin.from("consents").upsert({
        profile_id: pr.id,
        channel: "sms",
        status: "subscribed",
        source: "inbound_start",
        consented_at: new Date().toISOString(),
      }, { onConflict: "profile_id,channel" });
      await admin.from("suppressions").delete()
        .eq("account_id", pr.account_id)
        .eq("phone_e164", from);
    }
  }

  const accountIds = new Set<string>();
  const candidates: OutboundCandidate[] = [];

  const { data: recentCampaignMessages } = await admin
    .from("messages")
    .select("created_at, sender_used, campaigns!inner(account_id)")
    .eq("phone_e164", from)
    .in("status", ["sent", "delivered", "queued", "delivery_unconfirmed", "undelivered", "failed"])
    .order("created_at", { ascending: false })
    .limit(50);

  for (const row of recentCampaignMessages ?? []) {
    const accountId = row.campaigns?.account_id;
    if (!accountId) continue;
    candidates.push({ accountId, sender: row.sender_used ?? null, createdAt: row.created_at });
  }

  const { data: recentThreadReplies } = await admin
    .from("sms_thread_messages")
    .select("account_id, from_number, created_at")
    .eq("phone_e164", from)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(50);

  for (const row of recentThreadReplies ?? []) {
    if (!row.account_id) continue;
    candidates.push({ accountId: row.account_id, sender: row.from_number ?? null, createdAt: row.created_at });
  }

  candidates.sort(newestFirst);
  const ownsDestination = (accountId: string) => numberOwners.size === 0 || numberOwners.has(accountId);
  const exactSender = to
    ? candidates.find((candidate) => candidate.sender === to && ownsDestination(candidate.accountId))
    : undefined;
  const latestSender = candidates.find((candidate) => ownsDestination(candidate.accountId));

  if (exactSender) {
    accountIds.add(exactSender.accountId);
  } else if (latestSender) {
    accountIds.add(latestSender.accountId);
  } else if (numberOwners.size === 1) {
    accountIds.add(Array.from(numberOwners)[0]);
  }

  if (!bodyText || accountIds.size === 0) return;

  let targetAccountIds = Array.from(accountIds);
  if (providerSid) {
    const { data: existing } = await admin
      .from("sms_thread_messages")
      .select("account_id")
      .eq("provider_sid", providerSid)
      .in("account_id", targetAccountIds);
    const alreadyInserted = new Set((existing ?? []).map((row: { account_id: string }) => row.account_id));
    targetAccountIds = targetAccountIds.filter((accountId) => !alreadyInserted.has(accountId));
  }

  if (targetAccountIds.length === 0) return;

  await admin.from("sms_thread_messages").insert(
    targetAccountIds.map((account_id) => ({
      account_id,
      phone_e164: from,
      direction: "inbound" as const,
      body: bodyText,
      from_number: from,
      to_number: to ?? null,
      provider_sid: providerSid,
      status: "received",
    })),
  );

  try {
    const { forwardSmsToGorgias } = await import("@/lib/gorgias.server");
    await Promise.all(
      targetAccountIds.map((accountId) =>
        forwardSmsToGorgias({
          accountId,
          phone: from,
          fromNumber: to ?? null,
          body: bodyText,
          direction: "inbound",
        }),
      ),
    );
  } catch {
    // best effort
  }
}