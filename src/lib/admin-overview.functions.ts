import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}

async function fetchAllRows<T = any>(builder: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export const adminGetOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");


    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [
      accountsAll, accountsActive, accountsSuspended,
      pendingReq, msgs24, msgs7d, msgsFailed24,
      payments7d, allPayments, creditSum, lastSignups, lastMessagesRes, lastPayments,
      smsSpendAll, ratesRes,
    ] = await Promise.all([
      supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("onboarding_status", "active"),
      supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("onboarding_status", "suspended"),
      supabaseAdmin.from("number_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since24h),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since7d),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since24h).in("status", ["failed", "undelivered"]),
      supabaseAdmin.from("payments").select("amount,currency,status,created_at,provider").gte("created_at", since7d),
      supabaseAdmin.from("payments").select("amount,currency,status,provider,created_at"),
      supabaseAdmin.from("accounts").select("credit_balance"),
      supabaseAdmin.from("accounts").select("id,email,full_name,company,created_at").order("created_at", { ascending: false }).limit(6),
      supabaseAdmin.from("messages").select("id,phone_e164,status,created_at,campaign_id,cost,country_code").order("created_at", { ascending: false }).limit(8),
      supabaseAdmin.from("payments").select("id,amount,currency,status,provider,created_at,account_id").order("created_at", { ascending: false }).limit(6),
      fetchAllRows(() =>
        supabaseAdmin.from("messages")
          .select("cost,segments_count,country_code,status,created_at")
          .in("status", ["sent", "delivered", "delivery_unconfirmed"])
          .order("created_at", { ascending: false }),
      ),
      supabaseAdmin.from("country_rates").select("country_code,cost_price,sell_price"),
    ]);

    const smsRows: any[] = smsSpendAll as any[];


    const isPaid = (s: string) => s === "succeeded" || s === "approved" || s === "paid" || s === "finished" || s === "confirmed";
    // Platform accounting is USD. Non-USD payments (e.g. NGN from Paystack local currency)
    // are excluded from totals to avoid mixing currencies. Cancelled/failed/pending are also excluded.
    const isUsd = (c: any) => !c || String(c).toUpperCase() === "USD";
    const paid7d = (payments7d.data ?? []).filter((p: any) => isPaid(p.status) && isUsd(p.currency));
    const revenue7d = paid7d.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

    const allPaid = (allPayments.data ?? []).filter((p: any) => isPaid(p.status) && isUsd(p.currency));
    const totalCollected = allPaid.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const collectedByProvider: Record<string, number> = {};
    for (const p of allPaid) {
      const k = (p.provider ?? "other") as string;
      collectedByProvider[k] = (collectedByProvider[k] ?? 0) + Number(p.amount ?? 0);
    }
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const collected30d = allPaid
      .filter((p: any) => p.created_at >= since30d)
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

    const totalCredits = (creditSum.data ?? []).reduce((s: number, r: any) => s + Number(r.credit_balance ?? 0), 0);

    // SMS economics
    const rates = ratesRes.data ?? [];
    const costByCc = new Map<string, number>(rates.map((r: any) => [r.country_code, Number(r.cost_price ?? 0)]));
    // smsRows already declared above from paginated fetch
    const tenantSmsSpend = smsRows.reduce((s: number, m: any) => s + Number(m.cost ?? 0), 0);
    const carrierSmsCost = smsRows.reduce((s: number, m: any) => {
      const c = costByCc.get(m.country_code ?? "") ?? 0;
      const seg = Number(m.segments_count ?? 1);
      return s + c * seg;
    }, 0);
    const smsMargin = tenantSmsSpend - carrierSmsCost;
    const messagesSentAllTime = smsRows.length;
    const smsSpend30d = smsRows
      .filter((m: any) => m.created_at >= since30d)
      .reduce((s: number, m: any) => s + Number(m.cost ?? 0), 0);
    const carrierCost30d = smsRows
      .filter((m: any) => m.created_at >= since30d)
      .reduce((s: number, m: any) => {
        const c = costByCc.get(m.country_code ?? "") ?? 0;
        return s + c * Number(m.segments_count ?? 1);
      }, 0);

    // Estimated profit: revenue collected − carrier cost − unused credits still owed to tenants
    const estimatedProfit = totalCollected - carrierSmsCost - totalCredits;

    return {
      tenants: {
        total: accountsAll.count ?? 0,
        active: accountsActive.count ?? 0,
        suspended: accountsSuspended.count ?? 0,
      },
      messaging: {
        sent24h: msgs24.count ?? 0,
        sent7d: msgs7d.count ?? 0,
        failed24h: msgsFailed24.count ?? 0,
      },
      revenue: { last7d: revenue7d, payments7d: paid7d.length },
      credits: { totalBalance: totalCredits },
      financials: {
        totalCollected,
        collected30d,
        collectedByProvider,
        tenantSmsSpend,
        smsSpend30d,
        carrierSmsCost,
        carrierCost30d,
        smsMargin,
        estimatedProfit,
        unusedCredits: totalCredits,
        messagesSentAllTime,
        paymentsCount: allPaid.length,
      },
      pendingNumberRequests: pendingReq.count ?? 0,
      recent: {
        signups: lastSignups.data ?? [],
        messages: lastMessagesRes.data ?? [],
        payments: lastPayments.data ?? [],
      },
    };
  });


export const adminListMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [msgsRes, campRes, accRes] = await Promise.all([
      supabaseAdmin.from("messages").select("id,phone_e164,status,cost,country_code,error_code,created_at,campaign_id,segments_count,rendered_body").order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("campaigns").select("id,account_id,name"),
      supabaseAdmin.from("accounts").select("id,email,company,legal_business_name"),
    ]);
    const campMap = new Map((campRes.data ?? []).map((c: any) => [c.id, c]));
    const acctMap = new Map((accRes.data ?? []).map((a: any) => [a.id, a]));
    return (msgsRes.data ?? []).map((m: any) => {
      const c: any = m.campaign_id ? campMap.get(m.campaign_id) : null;
      const a: any = c ? acctMap.get(c.account_id) : null;
      return {
        ...m,
        campaign_name: c?.name ?? null,
        account_label: a ? (a.legal_business_name || a.company || a.email) : "—",
      };
    });
  });

export const adminListEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("events")
      .select("id,account_id,type,payload,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const adminListCompliance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [blockedRes, suspendedRes, eventsRes, accountsRes] = await Promise.all([
      supabaseAdmin
        .from("campaigns")
        .select("id,account_id,name,message_body,status,paused_reason,created_at")
        .eq("status", "blocked_content")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("accounts")
        .select("id,email,company,legal_business_name,onboarding_status,suspended_at")
        .eq("onboarding_status", "suspended")
        .order("suspended_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("events")
        .select("id,account_id,type,payload,created_at")
        .in("type", ["account_auto_suspended", "campaign_blocked_content", "content_scan_blocked"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("accounts").select("id,email,company,legal_business_name"),
    ]);

    const acctMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));
    const label = (a: any) => (a ? (a.legal_business_name || a.company || a.email) : "—");

    return {
      blockedCampaigns: (blockedRes.data ?? []).map((c: any) => ({
        ...c,
        account_label: label(acctMap.get(c.account_id)),
      })),
      suspendedAccounts: suspendedRes.data ?? [],
      events: (eventsRes.data ?? []).map((e: any) => ({
        ...e,
        account_label: label(acctMap.get(e.account_id)),
      })),
    };
  });

export const adminReinstateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => input)
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({ suspended_at: null, onboarding_status: "active" })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("events").insert({
      type: "account_reinstated",
      account_id: data.accountId,
      payload: { by: context.userId },
    });
    return { ok: true };
  });

export const adminListTollfreeAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [attemptsRes, accountsRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("tollfree_verification_attempts")
        .select("id,account_id,actor_user_id,sender_asset_id,phone_number,telnyx_number_id,telnyx_messaging_profile_id,telnyx_verification_id,attempt_status,failure_reason,friendly_failure_reason,provider_status,provider_code,provider_more_info,provider_response,request_summary,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("accounts").select("id,email,company,legal_business_name,full_name"),
    ]);
    if (attemptsRes.error) throw new Error(attemptsRes.error.message);
    if (accountsRes.error) throw new Error(accountsRes.error.message);
    const accountMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));

    const verificationSids = Array.from(
      new Set(
        (attemptsRes.data ?? [])
          .map((a: any) => a.telnyx_verification_id)
          .filter((sid: string | null): sid is string => !!sid),
      ),
    );
    let assetMap = new Map<string, any>();
    if (verificationSids.length > 0) {
      const { data: assets } = await (supabaseAdmin as any)
        .from("sender_assets")
        .select("telnyx_verification_id,verification_status,rejection_reason,friendly_rejection_reason,last_synced_at")
        .in("telnyx_verification_id", verificationSids);
      assetMap = new Map((assets ?? []).map((a: any) => [a.telnyx_verification_id, a]));
    }

    return (attemptsRes.data ?? []).map((attempt: any) => {
      const account = accountMap.get(attempt.account_id);
      const asset = attempt.telnyx_verification_id ? assetMap.get(attempt.telnyx_verification_id) : null;
      return {
        ...attempt,
        account_label: account?.legal_business_name || account?.company || account?.email || attempt.account_id,
        account_email: account?.email ?? null,
        actor_label:
          account?.full_name || account?.email || (attempt.actor_user_id === attempt.account_id ? "Account owner" : attempt.actor_user_id),
        verification_status: asset?.verification_status ?? null,
        rejection_reason: asset?.rejection_reason ?? null,
        friendly_rejection_reason: asset?.friendly_rejection_reason ?? null,
        last_synced_at: asset?.last_synced_at ?? null,
      };
    });
  });

