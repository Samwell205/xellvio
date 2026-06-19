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
      payments7d, creditSum, lastSignups, lastMessages, lastPayments,
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
      supabaseAdmin.from("messages").select("id,to_e164,status,created_at,account_id").order("created_at", { ascending: false }).limit(8),
      supabaseAdmin.from("payments").select("id,amount,currency,status,provider,created_at,account_id").order("created_at", { ascending: false }).limit(6),
    ]);

    const paid7d = (payments7d.data ?? []).filter((p) => p.status === "succeeded" || p.status === "approved");
    const revenue7d = paid7d.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalCredits = (creditSum.data ?? []).reduce((s, r) => s + Number(r.credit_balance ?? 0), 0);

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
        messages: lastMessages.data ?? [],
        payments: lastPayments.data ?? [],
      },
    };
  });

export const adminListMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: msgs }, { data: accts }] = await Promise.all([
      supabaseAdmin.from("messages").select("id,account_id,to_e164,from_e164,status,price,country_code,error_code,created_at,campaign_id").order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("accounts").select("id,email,company,legal_business_name"),
    ]);
    const acctMap = new Map((accts ?? []).map((a) => [a.id, a]));
    return (msgs ?? []).map((m) => {
      const a = acctMap.get(m.account_id);
      return { ...m, account_label: a?.legal_business_name || a?.company || a?.email || m.account_id };
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
