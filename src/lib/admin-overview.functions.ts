import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
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
      payments7d, creditSum, lastSignups, lastMessagesRes, lastPayments,
    ] = await Promise.all([
      supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("onboarding_status", "active"),
      supabaseAdmin.from("accounts").select("id", { count: "exact", head: true }).eq("onboarding_status", "suspended"),
      supabaseAdmin.from("number_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since24h),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since7d),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since24h).in("status", ["failed", "undelivered"]),
      supabaseAdmin.from("payments").select("amount,status,created_at").gte("created_at", since7d),
      supabaseAdmin.from("accounts").select("credit_balance"),
      supabaseAdmin.from("accounts").select("id,email,full_name,company,created_at").order("created_at", { ascending: false }).limit(6),
      supabaseAdmin.from("messages").select("id,phone_e164,status,created_at,campaign_id,cost,country_code").order("created_at", { ascending: false }).limit(8),
      supabaseAdmin.from("payments").select("id,amount,currency,status,provider,created_at,account_id").order("created_at", { ascending: false }).limit(6),
    ]);

    const paid7d = (payments7d.data ?? []).filter((p: any) => p.status === "succeeded" || p.status === "approved");
    const revenue7d = paid7d.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const totalCredits = (creditSum.data ?? []).reduce((s: number, r: any) => s + Number(r.credit_balance ?? 0), 0);

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
      supabaseAdmin.from("messages").select("id,phone_e164,status,cost,country_code,error_code,created_at,campaign_id,segments_count").order("created_at", { ascending: false }).limit(200),
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

export const adminListTollfreeAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [attemptsRes, accountsRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("tollfree_verification_attempts")
        .select("id,account_id,actor_user_id,sender_asset_id,phone_number,phone_sid,messaging_service_sid,verification_sid,attempt_status,failure_reason,friendly_failure_reason,twilio_status,twilio_code,twilio_more_info,twilio_response,request_summary,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("accounts").select("id,email,company,legal_business_name,full_name"),
    ]);
    if (attemptsRes.error) throw new Error(attemptsRes.error.message);
    if (accountsRes.error) throw new Error(accountsRes.error.message);
    const accountMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));
    return (attemptsRes.data ?? []).map((attempt: any) => {
      const account = accountMap.get(attempt.account_id);
      return {
        ...attempt,
        account_label: account?.legal_business_name || account?.company || account?.email || attempt.account_id,
        account_email: account?.email ?? null,
        actor_label:
          account?.full_name || account?.email || (attempt.actor_user_id === attempt.account_id ? "Account owner" : attempt.actor_user_id),
      };
    });
  });
