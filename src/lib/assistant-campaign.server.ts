import { z } from "zod";
import { resolveActingAccount, assertPermission } from "./acting-account.server";
import { getCampaignAudienceCountryCountsForUser } from "./audience.server";
import { calculateSegments } from "./sms-segments";
import { withSmsOptOut } from "./sms-optout";
import { TOS_CURRENT_VERSION } from "./tos";
import type { Json } from "@/integrations/supabase/types";

const audienceSchema = z.object({
  include: z.array(z.string().uuid()).default([]),
  exclude: z.array(z.string().uuid()).default([]),
  profile_ids: z.array(z.string().uuid()).default([]),
  list_ids: z.array(z.string().uuid()).default([]),
  excluded_countries: z.array(z.string()).default([]),
});
export async function assistantCampaignReview(userId: string, campaignId: string) {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "campaigns");
  assertPermission(acting, "audience");
  if (!acting.isOwner && acting.role === "viewer")
    throw new Error("Read-only team members cannot launch campaigns.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [campaign, account, assets, rates] = await Promise.all([
    db
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("account_id", acting.accountId)
      .single(),
    db
      .from("accounts")
      .select("credit_balance,suspended_at,sending_suspended_at,tos_current_version_accepted")
      .eq("id", acting.accountId)
      .single(),
    db
      .from("sender_assets")
      .select(
        "country_code,sender_kind,phone_number,telnyx_messaging_profile_id,verification_status",
      )
      .eq("account_id", acting.accountId)
      .eq("verification_status", "verified"),
    db.from("country_rates").select("country_code,sell_price,mms_multiplier").eq("active", true),
  ]);
  if (campaign.error || account.error || assets.error || rates.error)
    throw new Error("Campaign review could not be loaded.");
  const c = campaign.data;
  if (c.status !== "draft")
    throw new Error(
      "Only saved draft campaigns can be launched here. This campaign is no longer a draft.",
    );
  // Advanced drafts retain their original builder workflow rather than changing settings silently.
  if (c.media_url || c.track_links)
    throw new Error(
      "This campaign uses images or tracked links. Use Review / edit to launch it with its exact preview.",
    );
  const audience = audienceSchema.parse(c.audience);
  const counts = (await getCampaignAudienceCountryCountsForUser(userId, audience))
    .filter((x) => !audience.excluded_countries.includes(x.country_code))
    .sort((a, b) => a.country_code.localeCompare(b.country_code));
  const body = withSmsOptOut(c.message_body);
  const segments = calculateSegments(body).segments;
  const senderMap: Record<string, Json> = {};
  const blockers: string[] = [];
  let cost = 0;
  for (const row of counts) {
    const rate = rates.data.find((r) => r.country_code === row.country_code);
    const asset =
      assets.data.find((a) => a.country_code === row.country_code) ??
      (["US", "CA"].includes(row.country_code)
        ? assets.data.find(
            (a) =>
              ["US", "CA"].includes(a.country_code) &&
              ["local", "toll_free"].includes(a.sender_kind),
          )
        : undefined);
    if (!rate || !Number.isFinite(Number(rate.sell_price)) || Number(rate.sell_price) < 0)
      blockers.push(`No active price for ${row.country_code}.`);
    else cost += row.recipients * segments * Number(rate.sell_price);
    if (!asset || (!asset.phone_number && !asset.telnyx_messaging_profile_id))
      blockers.push(`No verified sender for ${row.country_code}.`);
    else
      senderMap[row.country_code] = {
        sender_kind: asset.sender_kind,
        phone_number: asset.phone_number,
        telnyx_messaging_profile_id: asset.telnyx_messaging_profile_id,
      };
  }
  const recipients = counts.reduce((n, r) => n + r.recipients, 0);
  cost = Number(cost.toFixed(4));
  if (!recipients) blockers.push("No eligible opted-in recipients remain in this audience.");
  if (!c.name.trim() || !body.trim() || body.length > 1600)
    blockers.push("Campaign name or message is incomplete.");
  if (account.data.suspended_at || account.data.sending_suspended_at)
    blockers.push("Sending is on hold. Contact support.");
  if (account.data.tos_current_version_accepted !== TOS_CURRENT_VERSION)
    blockers.push("Accept the current Terms of Service before sending.");
  if (Number(account.data.credit_balance) < cost)
    blockers.push("Insufficient balance for this campaign.");
  if (
    !["now", "scheduled"].includes(c.send_mode) ||
    (c.send_mode === "scheduled" && (!c.schedule_at || Date.parse(c.schedule_at) <= Date.now()))
  )
    blockers.push("Choose a valid sending time in Review / edit.");
  return {
    acting,
    db,
    campaign: c,
    body,
    senderMap,
    summary: {
      name: c.name,
      body,
      recipients,
      segments,
      cost,
      balance: Number(account.data.credit_balance),
      sendMode: c.send_mode,
      scheduleAt: c.schedule_at,
      blockers,
    },
    snapshot: { updatedAt: c.updated_at, body, recipients, cost, senderMap, counts },
  };
}

export async function prepareAssistantCampaignLaunch(userId: string, campaignId: string) {
  const r = await assistantCampaignReview(userId, campaignId);
  const op = await r.db
    .from("assistant_operations")
    .insert({
      account_id: r.acting.accountId,
      user_id: userId,
      kind: "campaign_launch",
      arguments: { campaignId, snapshot: r.snapshot, summary: r.summary },
    })
    .select("id,expires_at")
    .single();
  if (op.error) throw new Error("The launch review could not be saved.");
  return { id: op.data.id, expiresAt: op.data.expires_at, ...r.summary };
}

export async function confirmAssistantCampaignLaunch(
  userId: string,
  id: string,
  consent: boolean,
  choice: "tested" | "skipped",
  userAgent: string,
) {
  if (!consent) throw new Error("Confirm recipient consent and sending terms before launch.");
  const acting = await resolveActingAccount(userId);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const op = await db
    .from("assistant_operations")
    .select("arguments,status,outcome,expires_at")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("account_id", acting.accountId)
    .eq("kind", "campaign_launch")
    .single();
  if (op.error) throw new Error("Launch review not found.");
  if (op.data.status === "completed") return op.data.outcome;
  if (op.data.status !== "pending" || Date.parse(op.data.expires_at) <= Date.now())
    throw new Error("Launch review expired or cancelled. Start a fresh review.");
  const args = op.data.arguments as { campaignId: string; snapshot: Json };
  const r = await assistantCampaignReview(userId, args.campaignId);
  if (r.summary.blockers.length) throw new Error(r.summary.blockers.join(" "));
  if (JSON.stringify(r.snapshot) !== JSON.stringify(args.snapshot)) {
    // JSON objects can be reordered by persistence; compare a stable canonical representation.
    const canonical = (v: unknown): string =>
      JSON.stringify(v, (_, val) =>
        val && typeof val === "object" && !Array.isArray(val)
          ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
          : val,
      );
    if (canonical(r.snapshot) !== canonical(args.snapshot))
      throw new Error("Campaign, audience, price or sender changed. Start a fresh review.");
  }
  const { keywordScan } = await import("./content-scanner");
  const keyword = keywordScan(r.body);
  if (!keyword.allowed || keyword.confidence === "keyword")
    throw new Error(keyword.reason ?? "Message requires content review.");
  const { aiScan } = await import("./ai-content-scan.server");
  const scan = await aiScan(r.body);
  const { aiUnavailableFallback } = await import("./ai-unavailable-fallback");
  if (!scan.allowed || (scan.unavailable && aiUnavailableFallback(r.body).risky))
    throw new Error(scan.unavailable ? aiUnavailableFallback(r.body).message : (scan.reason ?? "Message could not be safety-checked. Nothing was launched."));
  const result = await db.rpc("confirm_assistant_campaign_launch", {
    _id: id,
    _user_id: userId,
    _account_id: acting.accountId,
    _choice: choice,
    _user_agent: userAgent.slice(0, 500),
    _tos_version: TOS_CURRENT_VERSION,
  });
  if (result.error)
    throw new Error(
      "Campaign could not be launched; it may have changed or sending is blocked. Start a fresh review.",
    );
  return result.data;
}
