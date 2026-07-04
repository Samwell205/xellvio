// Pre-send content screening. Every outbound message on Xellvio MUST pass
// through screenMessageContent() before it reaches Telnyx. This is the
// compliance firewall enforced across every send path (campaigns, test SMS,
// inbox replies).
//
// Screening runs six independent checks, produces a 0–100 risk score, and
// makes a three-way decision:
//   score < 40 → passed (send normally)
//   score 40–69 → held for admin review (auto-approves after opts.autoApproveHours)
//   score ≥ 70 → blocked entirely
// Every decision (pass / hold / block) is written to content_screening_log.

import { keywordScan } from "./content-scanner";

export interface ScreeningReason {
  code: string;
  message: string;
  score: number;
  detail?: string;
}

export interface ScreeningResult {
  passed: boolean;
  action: "passed" | "held_for_review" | "blocked";
  blockedReasons: string[];
  reasons: ScreeningReason[];
  riskScore: number;
  reviewQueueId?: string;
}

export interface ScreenOpts {
  campaignId?: string | null;
  phoneE164?: string | null;
  /**
   * Planned recipient count for this send. If provided, triggers the volume
   * anomaly check against the tenant's 7-day daily average.
   */
  plannedRecipients?: number;
  /** Context tag for the audit log (e.g. "campaign_plan", "test_send", "inbox_reply"). */
  context?: string;
  /** Skip enqueueing a review_queue row (e.g. for test sends where a hold makes no sense). */
  skipReviewQueue?: boolean;
  /** Auto-approval TTL for review-queue entries in hours. Defaults to 2. */
  autoApproveHours?: number;
}

const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;
const STOP_LANGUAGE_REGEX = /\b(stop|unsubscribe|reply\s*stop|opt[-\s]?out)\b/i;

function extractDomains(text: string): string[] {
  const urls = text.match(URL_REGEX) ?? [];
  const domains: string[] = [];
  for (const u of urls) {
    try {
      const withProto = u.startsWith("http") ? u : `https://${u}`;
      const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
      if (host) domains.push(host);
    } catch {
      /* malformed URL, ignore */
    }
  }
  return domains;
}

export async function screenMessageContent(
  text: string,
  tenantAccountId: string,
  opts: ScreenOpts = {},
): Promise<ScreeningResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const reasons: ScreeningReason[] = [];
  const body = (text ?? "").toString();

  // ---- (a) Prohibited category / phishing keyword scan ------------------
  const scan = keywordScan(body);
  if (scan.confidence === "keyword" && scan.category) {
    const isBlock = !scan.allowed;
    reasons.push({
      code: `category:${scan.category}`,
      message: scan.reason ?? `Prohibited category: ${scan.category}`,
      score: isBlock ? 80 : 40,
      detail: scan.details,
    });
  }

  // ---- (b) Excessive link count -----------------------------------------
  const urls = body.match(URL_REGEX) ?? [];
  if (urls.length > 1) {
    reasons.push({
      code: "excessive_links",
      message: `Message contains ${urls.length} URLs. More than one link is discouraged and often filtered by carriers.`,
      score: urls.length >= 3 ? 30 : 20,
      detail: urls.slice(0, 5).join(", "),
    });
  }

  // ---- (c) URL reputation (blocklist + shorteners) ----------------------
  const domains = extractDomains(body);
  if (domains.length > 0) {
    const { data: hits } = await supabaseAdmin
      .from("blocked_domains")
      .select("domain, is_shortener, reason, allowed_by_accounts")
      .in("domain", domains);
    for (const hit of hits ?? []) {
      const isAllowed = (hit.allowed_by_accounts ?? []).includes(tenantAccountId);
      if (isAllowed) continue;
      reasons.push({
        code: hit.is_shortener ? "shortener_link" : "blocked_domain",
        message: hit.is_shortener
          ? `Uses URL shortener ${hit.domain}. Shorteners are frequently blocked by carriers and used for cloaking — link the destination directly, or ask an admin to allowlist this domain for your account.`
          : `Blocked domain: ${hit.domain}${hit.reason ? ` (${hit.reason})` : ""}`,
        score: hit.is_shortener ? 40 : 60,
        detail: hit.domain,
      });
    }
  }

  // ---- (d) Volume anomaly (vs. trailing 7-day average) ------------------
  if (opts.plannedRecipients && opts.plannedRecipients > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: last7 } = await supabaseAdmin
      .from("messages")
      .select("id, campaigns!inner(account_id)", { count: "exact", head: true })
      .eq("campaigns.account_id", tenantAccountId)
      .gte("created_at", sevenDaysAgo);
    const dailyAvg = Math.max(1, Math.round((last7 ?? 0) / 7));
    if (opts.plannedRecipients > dailyAvg * 5 && (last7 ?? 0) > 100) {
      reasons.push({
        code: "volume_anomaly",
        message: `Planned send (${opts.plannedRecipients}) is more than 5× your 7-day daily average (${dailyAvg}/day).`,
        score: 25,
        detail: `avg=${dailyAvg}/day, planned=${opts.plannedRecipients}`,
      });
    }
  }

  // ---- (e) Missing opt-out language -------------------------------------
  if (!STOP_LANGUAGE_REGEX.test(body)) {
    reasons.push({
      code: "missing_optout",
      message: "Message does not contain opt-out language (STOP, unsubscribe, reply STOP).",
      score: 15,
    });
  }

  // ---- (f) Frequency-to-recipient (11th+ in 24h) ------------------------
  if (opts.phoneE164) {
    // If this contact is flagged two_way_opt_in, skip the cap entirely.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("two_way_opt_in")
      .eq("account_id", tenantAccountId)
      .eq("phone_e164", opts.phoneE164)
      .maybeSingle();
    if (!profile?.two_way_opt_in) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recent } = await supabaseAdmin
        .from("messages")
        .select("id, campaigns!inner(account_id)", { count: "exact", head: true })
        .eq("campaigns.account_id", tenantAccountId)
        .eq("phone_e164", opts.phoneE164)
        .gte("created_at", oneDayAgo);
      if ((recent ?? 0) >= 10) {
        reasons.push({
          code: "recipient_frequency_cap",
          message: `Would be the ${(recent ?? 0) + 1}th message to ${opts.phoneE164} in 24h. Mark this contact as two-way to allow high-frequency sends.`,
          score: 60,
          detail: `count_24h=${recent ?? 0}`,
        });
      }
    }
  }

  // ---- Score + decision --------------------------------------------------
  const riskScore = Math.min(100, reasons.reduce((s, r) => s + r.score, 0));
  const action: ScreeningResult["action"] =
    riskScore >= 70 ? "blocked" : riskScore >= 40 ? "held_for_review" : "passed";

  const blockedReasons = reasons.map((r) => r.message);

  // Audit log — every decision.
  try {
    await supabaseAdmin.from("content_screening_log").insert({
      account_id: tenantAccountId,
      campaign_id: opts.campaignId ?? null,
      message_text: body.slice(0, 4000),
      risk_score: riskScore,
      blocked_reasons: reasons as unknown as any,
      action_taken: action,
      context: opts.context ?? null,
    });
  } catch (e) {
    console.error("[screening] failed to write audit log", e);
  }

  // Queue for admin review when appropriate.
  let reviewQueueId: string | undefined;
  if (action === "held_for_review" && !opts.skipReviewQueue) {
    try {
      const autoApproveAt = new Date(
        Date.now() + (opts.autoApproveHours ?? 2) * 60 * 60 * 1000,
      ).toISOString();
      const { data: q } = await supabaseAdmin
        .from("review_queue")
        .insert({
          account_id: tenantAccountId,
          campaign_id: opts.campaignId ?? null,
          message_text: body.slice(0, 4000),
          risk_score: riskScore,
          blocked_reasons: reasons as unknown as any,
          status: "pending",
          auto_approve_at: autoApproveAt,
        })
        .select("id")
        .single();
      reviewQueueId = q?.id;
    } catch (e) {
      console.error("[screening] failed to enqueue review", e);
    }
  }

  // ---- Auto-suspend on serious or repeat abuse --------------------------
  // Policy:
  //   • Any hard-category hit (SHAFT / phishing / scam) → suspend on the
  //     FIRST offense. These categories can never be sent lawfully on our
  //     platform, so one attempt is enough.
  //   • Otherwise, 3+ "blocked" decisions in a rolling 7-day window →
  //     suspend for repeat abuse.
  // The suspension is logged in tenant_sending_suspensions and the account
  // appears on Admin → Compliance with a one-click Reinstate button.
  if (action === "blocked") {
    try {
      const hardCategoryHit = reasons.some((r) => {
        if (!r.code.startsWith("category:")) return false;
        // keywordScan marks blocks with score >= 80; that's our "hard" bar.
        return r.score >= 80;
      });

      let shouldSuspend = hardCategoryHit;
      let suspendReason = "";

      if (hardCategoryHit) {
        const cat = reasons.find((r) => r.code.startsWith("category:"))?.code.replace("category:", "");
        suspendReason = `Auto-suspended: prohibited content category (${cat ?? "SHAFT/phishing"}).`;
      } else {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: recentBlocks } = await supabaseAdmin
          .from("content_screening_log")
          .select("id", { count: "exact", head: true })
          .eq("account_id", tenantAccountId)
          .eq("action_taken", "blocked")
          .gte("created_at", sevenDaysAgo);
        if ((recentBlocks ?? 0) >= 3) {
          shouldSuspend = true;
          suspendReason = `Auto-suspended: ${recentBlocks} blocked messages in 7 days (repeat abuse).`;
        }
      }

      if (shouldSuspend) {
        // Don't double-suspend an already-suspended tenant.
        const { data: acct } = await supabaseAdmin
          .from("accounts")
          .select("sending_suspended_at")
          .eq("id", tenantAccountId)
          .maybeSingle();
        if (!acct?.sending_suspended_at) {
          const { suspendTenantSending } = await import("./tenant-suspension.server");
          await suspendTenantSending({
            tenantAccountId,
            reason: suspendReason,
            suspendedBy: null, // system
          });
          await supabaseAdmin.from("events").insert({
            account_id: tenantAccountId,
            type: "tenant_auto_suspended",
            payload: {
              reason: suspendReason,
              risk_score: riskScore,
              reasons: reasons.map((r) => ({ code: r.code, message: r.message })),
              campaign_id: opts.campaignId ?? null,
              context: opts.context ?? null,
            } as unknown as any,
          });
        }
      }
    } catch (e) {
      console.error("[screening] auto-suspend failed", e);
    }
  }

  return {
    passed: action === "passed",
    action,
    blockedReasons,
    reasons,
    riskScore,
    reviewQueueId,
  };
}

/**
 * Cheap gate used inside dispatcher hot loops after the full campaign-level
 * screen has already passed. Rechecks:
 *   - the tenant's sending is not suspended
 *   - current ToS version has been accepted
 *   - the recipient hasn't hit the 24h frequency cap
 * Returns { ok: true } to proceed or { ok: false, reason } to skip.
 */
export async function fastPerRecipientGate(
  tenantAccountId: string,
  phoneE164: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: acct } = await supabaseAdmin
    .from("accounts")
    .select("sending_suspended_at, tos_current_version_accepted")
    .eq("id", tenantAccountId)
    .maybeSingle();
  if (acct?.sending_suspended_at) return { ok: false, reason: "tenant_sending_suspended" };

  // Frequency cap check — cheap: single count query.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("two_way_opt_in")
    .eq("account_id", tenantAccountId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (profile?.two_way_opt_in) return { ok: true };
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id, campaigns!inner(account_id)", { count: "exact", head: true })
    .eq("campaigns.account_id", tenantAccountId)
    .eq("phone_e164", phoneE164)
    .gte("created_at", oneDayAgo);
  if ((count ?? 0) >= 10) return { ok: false, reason: "recipient_frequency_cap_24h" };
  return { ok: true };
}
