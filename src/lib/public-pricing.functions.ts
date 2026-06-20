import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicCountryRate = {
  country: string;
  code: string;
  dial: string;
  perSms: number;
  mmsMult: number;
  inbound: boolean;
  status: "Active" | "Inactive";
};

export const getPublicCountryRates = createServerFn({ method: "GET" }).handler(async () => {
  const supabasePublic = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabasePublic
    .from("country_rates_public")
    .select("country_code,country_name,dial_prefix,sell_price,mms_multiplier,sender_supports_inbound,active")
    .order("country_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    country: r.country_name,
    code: r.country_code,
    dial: r.dial_prefix,
    perSms: Number(r.sell_price),
    mmsMult: Number(r.mms_multiplier),
    inbound: Boolean(r.sender_supports_inbound),
    status: r.active ? "Active" : "Inactive",
  })) satisfies PublicCountryRate[];
});