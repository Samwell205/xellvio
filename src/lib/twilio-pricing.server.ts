// Twilio Messaging Pricing sync — server-only.
// Docs: https://www.twilio.com/docs/messaging/api/pricing
// GET https://pricing.twilio.com/v1/Messaging/Countries/{ISO}
// Response shape (snake_case JSON):
//   { country, iso_country, outbound_sms_prices: [
//       { carrier, mcc, mnc, prices: [ { number_type, base_price, current_price, ... } ] }
//   ], ... }

const PRICING_API = "https://pricing.twilio.com/v1/Messaging/Countries";

type TwilioPriceEntry = {
  number_type: string;
  current_price: string;
  base_price?: string;
};
type TwilioCarrierPrices = {
  carrier?: string;
  mcc?: string;
  mnc?: string;
  prices: TwilioPriceEntry[];
};
type TwilioCountryPricing = {
  country: string;
  iso_country: string;
  outbound_sms_prices: TwilioCarrierPrices[];
};

function basicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio master credentials not configured");
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

/** Round UP to 5 decimal places using integer math so margin is never eaten. */
export function ceil5(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n * 1e5) / 1e5;
}

/** Highest current_price (as number) across all carriers for a given number_type. */
function highestPriceFor(
  pricing: TwilioCountryPricing,
  numberType: string,
): number | null {
  let max: number | null = null;
  for (const carrier of pricing.outbound_sms_prices ?? []) {
    for (const p of carrier.prices ?? []) {
      if (p.number_type === numberType) {
        const v = Number(p.current_price);
        if (Number.isFinite(v) && (max === null || v > max)) max = v;
      }
    }
  }
  return max;
}

export type CountryPriceResult = {
  country_code: string;
  cost_price: number;
  number_type_used: string;
};

export async function fetchCountryPricing(iso: string): Promise<TwilioCountryPricing> {
  const res = await fetch(`${PRICING_API}/${encodeURIComponent(iso.toUpperCase())}`, {
    headers: { Authorization: basicAuth() },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Twilio pricing ${res.status}: ${json?.message ?? "request failed"}`);
  }
  return json as TwilioCountryPricing;
}

/**
 * Extract cost basis from a Twilio pricing response.
 * US/CA → toll-free. Others → mobile. Fallback → highest mobile.
 * Returns null when no usable price exists.
 */
export function extractCost(
  iso: string,
  pricing: TwilioCountryPricing,
): CountryPriceResult | null {
  const code = iso.toUpperCase();
  const preferred = code === "US" || code === "CA" ? "toll-free" : "mobile";

  let price = highestPriceFor(pricing, preferred);
  let typeUsed = preferred;

  if (price === null && preferred !== "mobile") {
    price = highestPriceFor(pricing, "mobile");
    typeUsed = "mobile";
  }
  if (price === null) return null;
  return { country_code: code, cost_price: price, number_type_used: typeUsed };
}

export type SyncRow = {
  country_code: string;
  status: "ok" | "skipped_override" | "no_price" | "error";
  cost_price?: number;
  sell_price?: number;
  number_type_used?: string;
  message?: string;
};

/**
 * Full sync. Iterates every row in country_rates, fetches Twilio pricing,
 * writes cost_price + sell_price (cost * (1 + markup/100), ceil 5dp),
 * unless manual_override = true. Writes audit rows to pricing_sync_log.
 */
export async function runTwilioPricingSync(): Promise<{
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: SyncRow[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Default markup from platform_settings
  const { data: settingRow } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "default_markup_percent")
    .maybeSingle();
  const defaultMarkup = Number((settingRow?.value as any) ?? 50);

  const { data: countries, error: cErr } = await supabaseAdmin
    .from("country_rates")
    .select("id, country_code, markup_percent, manual_override");
  if (cErr) throw new Error(cErr.message);

  const rows: SyncRow[] = [];
  let updated = 0, skipped = 0, errors = 0;

  for (const c of countries ?? []) {
    const iso = (c.country_code as string).toUpperCase();
    if (c.manual_override) {
      rows.push({ country_code: iso, status: "skipped_override" });
      skipped++;
      await supabaseAdmin.from("pricing_sync_log").insert({
        country_code: iso, status: "skipped_override", message: "manual_override=true",
      });
      continue;
    }
    try {
      const pricing = await fetchCountryPricing(iso);
      const extracted = extractCost(iso, pricing);
      if (!extracted) {
        await supabaseAdmin
          .from("country_rates")
          .update({ active: false, last_synced_at: new Date().toISOString() })
          .eq("id", c.id);
        await supabaseAdmin.from("pricing_sync_log").insert({
          country_code: iso, status: "no_price", message: "no usable number_type price; deactivated",
        });
        rows.push({ country_code: iso, status: "no_price" });
        errors++;
        continue;
      }
      const markup = Number(c.markup_percent ?? defaultMarkup);
      const sell = ceil5(extracted.cost_price * (1 + markup / 100));
      const cost = ceil5(extracted.cost_price); // also 5dp

      const { error: uErr } = await supabaseAdmin
        .from("country_rates")
        .update({
          cost_price: cost,
          sell_price: sell,
          number_type_used: extracted.number_type_used,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (uErr) throw new Error(uErr.message);

      await supabaseAdmin.from("pricing_sync_log").insert({
        country_code: iso,
        number_type_used: extracted.number_type_used,
        cost_price: cost,
        sell_price: sell,
        status: "ok",
      });
      rows.push({
        country_code: iso, status: "ok",
        cost_price: cost, sell_price: sell,
        number_type_used: extracted.number_type_used,
      });
      updated++;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      await supabaseAdmin.from("pricing_sync_log").insert({
        country_code: iso, status: "error", message: msg.slice(0, 500),
      });
      rows.push({ country_code: iso, status: "error", message: msg });
      errors++;
    }
  }

  return { total: countries?.length ?? 0, updated, skipped, errors, rows };
}
