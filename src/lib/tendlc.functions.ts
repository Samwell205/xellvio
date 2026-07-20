import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActingAccount, assertPermission } from "@/lib/acting-account.server";

const TENDLC_SETUP_FEE_USD = 50;

const BrandSchema = z.object({
  legal_name: z.string().min(2).max(200),
  ein: z.string().min(4).max(20),
  brand_type: z.enum(["private", "public", "non_profit", "government"]),
  vertical: z.string().min(2).max(100),
  website: z.string().url(),
  address_line: z.string().min(2).max(200),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(50),
  postal_code: z.string().min(3).max(20),
  country: z.string().length(2).default("US"),
  contact_first_name: z.string().min(1).max(100),
  contact_last_name: z.string().min(1).max(100),
  contact_email: z.string().email(),
  contact_phone: z.string().min(6).max(30),
});

const CampaignSchema = z.object({
  use_case: z.enum(["marketing", "mixed", "low_volume", "customer_care", "account_notification"]),
  description: z.string().min(40).max(2000),
  sample_message_1: z.string().min(20).max(1000),
  sample_message_2: z.string().min(20).max(1000),
  opt_in_flow: z.string().min(20).max(2000),
  opt_in_confirmation_url: z.string().url(),
  help_keywords: z.string().default("HELP"),
  stop_keywords: z.string().default("STOP,UNSUBSCRIBE,CANCEL,END,QUIT"),
});

export const getTenDlcStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const acting = await resolveActingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenant_10dlc_registrations")
      .select("*")
      .eq("account_id", acting.accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      registration: data,
      setup_fee_usd: TENDLC_SETUP_FEE_USD,
    };
  });

export const submitTenDlcRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      brand: BrandSchema,
      campaign: CampaignSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "setup_sms");
    const accountId = acting.accountId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("tenant_10dlc_registrations")
      .select("id,status")
      .eq("account_id", accountId)
      .maybeSingle();
    if (existing && ["submitted", "in_review", "verified"].includes(existing.status)) {
      throw new Error(`10DLC registration already ${existing.status}`);
    }

    try {
      await supabaseAdmin.rpc("debit_account", {
        _account_id: accountId,
        _amount: TENDLC_SETUP_FEE_USD,
        _campaign_id: undefined as unknown as string,
        _description: "10DLC brand + campaign registration setup fee",
      });
    } catch (e: any) {
      throw new Error(`Cannot charge $${TENDLC_SETUP_FEE_USD} setup fee: ${e?.message ?? e}`);
    }

    try {
      const payload = {
        brand: data.brand,
        campaign: data.campaign,
        submitted_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabaseAdmin
        .from("tenant_10dlc_registrations")
        .upsert({
          account_id: accountId,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          metadata: payload,
          rejection_reason: null,
          approved_at: null,
        }, { onConflict: "account_id" });
      if (upErr) throw new Error(upErr.message);

      return { ok: true, status: "submitted" as const };
    } catch (e: any) {
      try {
        await supabaseAdmin.rpc("topup_account", {
          _account_id: accountId,
          _amount: TENDLC_SETUP_FEE_USD,
          _description: "Refund: 10DLC registration failed",
        });
      } catch {}
      throw new Error(e?.message ?? "10DLC submission failed");
    }
  });
