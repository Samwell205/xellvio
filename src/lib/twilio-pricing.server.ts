// Compat: Telnyx pricing sync stub. The prior Twilio pricing endpoint had a
// unified per-country wholesale price. Telnyx uses per-country / per-carrier
// pricing that requires the `MessagingLookup` API and account-specific rates.
//
// For Phase 1 we keep the existing manual cost/sell prices in country_rates.
// A future migration will add an automated Telnyx pricing sync. For now this
// module returns a no-op sync so the admin "Refresh pricing" button no longer
// hits Twilio and does not touch overridden rows.

export type SyncRow = {
  country_code: string;
  status: "ok" | "skipped_override" | "no_price" | "error";
  cost_price?: number;
  sell_price?: number;
  number_type_used?: string;
  message?: string;
};

export async function runTwilioPricingSync(): Promise<{
  total: number; updated: number; skipped: number; errors: number; rows: SyncRow[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: countries } = await supabaseAdmin
    .from("country_rates").select("country_code");
  const rows: SyncRow[] = (countries ?? []).map((c: any) => ({
    country_code: c.country_code,
    status: "skipped_override",
    message: "Automatic pricing sync is not yet implemented for Telnyx. Manage cost/sell prices manually.",
  }));
  return { total: rows.length, updated: 0, skipped: rows.length, errors: 0, rows };
}
