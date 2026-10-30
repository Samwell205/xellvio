import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseDedicatedLineRegistration } from "./tollfree-registration";

export const getMyDedicatedLine = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveActingAccount } = await import("./acting-account.server");
    const acting = await resolveActingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let { data } = await db.from("tenant_twilio_lines").select("status").eq("account_id", acting.accountId).maybeSingle();
    if (data?.status === "verification_pending") {
      const { refreshLine } = await import("./twilio-lines.server");
      await refreshLine(acting.accountId).catch((e) => console.error("[line refresh]", e));
    }
    ({ data } = await db.from("tenant_twilio_lines")
      .select("phone_number,status,status_detail,monthly_fee_usd,renews_at,billing_status,created_at,updated_at")
      .eq("account_id", acting.accountId).maybeSingle());
    const { data: fee } = await db.from("platform_settings").select("value").eq("key", "twilio_line_monthly_usd").maybeSingle();
    const { data: acct } = await db.from("accounts")
      .select("legal_business_name,website_url,business_reg_number,privacy_policy_url,terms_url,contact_email,full_name,phone,use_case_description,sample_message,opt_in_screenshot_url")
      .eq("id", acting.accountId).maybeSingle();
    return { line: data ?? null, monthlyFee: Number(String(fee?.value ?? "5").replace(/"/g, "")) || 5, prefill: acct ?? null };
  });

export const requestDedicatedLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseDedicatedLineRegistration)
  .handler(async ({ data, context }) => {
    const { resolveBillingAccount } = await import("./billing-account.server");
    const acting = await resolveBillingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: acct } = await db.from("accounts").select("onboarding_status,sending_suspended_at").eq("id", acting.accountId).maybeSingle();
    if (!acct || acct.onboarding_status === "suspended" || acct.sending_suspended_at) throw new Error("Sending is on hold for this business. Please contact support.");

    const { data: fee } = await db.from("platform_settings").select("value").eq("key", "twilio_line_monthly_usd").maybeSingle();
    const price = Number(String(fee?.value ?? "5").replace(/"/g, "")) || 5;

    await db.from("tenant_twilio_lines").upsert({ account_id: acting.accountId, monthly_fee_usd: price }, { onConflict: "account_id", ignoreDuplicates: true });
    const { data: row } = await db.from("tenant_twilio_lines").select("status,charged_at").eq("account_id", acting.accountId).maybeSingle();
    if (row?.status === "active") return { status: "active" };
    if (row?.status === "verification_pending") return { status: "verification_pending" };

    // Charge the first month exactly once; a retry after a failed setup step resumes without charging again.
    // A business that already paid the toll-free setup fee is not charged a second time for the first month.
    const { data: feeRow } = await db.from("accounts").select("tollfree_setup_fee_paid_at").eq("id", acting.accountId).maybeSingle();
    if (!row?.charged_at && feeRow?.tollfree_setup_fee_paid_at) {
      await db.from("tenant_twilio_lines").update({ charged_at: new Date().toISOString() }).eq("account_id", acting.accountId).is("charged_at", null);
    } else if (!row?.charged_at) {
      const { data: claimed } = await db.from("tenant_twilio_lines").update({ charged_at: new Date().toISOString() })
        .eq("account_id", acting.accountId).is("charged_at", null).select("account_id");
      if (claimed?.length) {
        const { error } = await db.rpc("debit_account", { _account_id: acting.accountId, _amount: price, _campaign_id: null, _description: "Dedicated toll-free number — first month" });
        if (error) {
          await db.from("tenant_twilio_lines").update({ charged_at: null }).eq("account_id", acting.accountId);
          throw new Error(/insufficient/i.test(error.message) ? `Add at least $${price.toFixed(2)} credit to request a dedicated number.` : "Could not charge your credit. Please try again.");
        }
      }
    }
    const { provisionLine } = await import("./twilio-lines.server");
    try {
      return await provisionLine(acting.accountId, { ...data, ein: data.ein ? data.ein.replace(/\D/g, "").replace(/^(\d{2})/, "$1-") : undefined });
    } catch (e: any) {
      await db.from("tenant_twilio_lines").update({ status_detail: String(e?.message ?? "Setup failed").slice(0, 300) }).eq("account_id", acting.accountId);
      throw new Error(`Setup paused: ${e?.message ?? "please try again"}. You won't be charged again when you retry.`);
    }
  });
