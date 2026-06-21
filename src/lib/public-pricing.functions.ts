import { createServerFn } from "@tanstack/react-start";

export type PublicCountryRate = {
  country: string;
  code: string;
  dial: string;
  perSms: number;
  mmsMult: number;
  inbound: boolean;
  status: "Active" | "Inactive";
};

// Server-side only: uses the privileged admin client to read the raw
// country_rates table but projects ONLY safe public columns. This is the
// single controlled access path for non-admin pricing reads — both the
// public /pricing page and the tenant SMS Pricing page call this fn.
export const getPublicCountryRates = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("country_rates")
    .select("country_code,country_name,dial_prefix,sell_price,mms_multiplier,sender_supports_inbound,active")
    .order("country_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    country: r.country_name ?? "",
    code: r.country_code ?? "",
    dial: r.dial_prefix ?? "",
    perSms: Number(r.sell_price),
    mmsMult: Number(r.mms_multiplier),
    inbound: Boolean(r.sender_supports_inbound),
    status: r.active ? "Active" : "Inactive",
  })) satisfies PublicCountryRate[];
});
