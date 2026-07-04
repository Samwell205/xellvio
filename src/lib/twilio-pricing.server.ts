// Telnyx pricing sync. Telnyx does not expose a public per-country
// pricing API, so we ship a curated map of published wholesale outbound-SMS
// prices (USD, per segment) from telnyx.com/pricing/messaging. Admins can
// still override any country manually; overridden rows are never touched
// by this sync.

export type SyncRow = {
  country_code: string;
  status: "ok" | "skipped_override" | "no_price" | "error";
  cost_price?: number;
  sell_price?: number;
  number_type_used?: string;
  message?: string;
};

// Published Telnyx outbound SMS wholesale price per segment, USD.
// Keep this alphabetised by ISO-2. If a country is missing here we leave the
// existing cost_price untouched and report "no_price".
const TELNYX_SMS_COST: Record<string, number> = {
  AE: 0.0380, AR: 0.0836, AT: 0.0979, AU: 0.0515, BD: 0.0410, BE: 0.1113,
  BG: 0.0765, BH: 0.0341, BR: 0.0264, CA: 0.0075, CH: 0.0768, CL: 0.0580,
  CN: 0.0570, CO: 0.0163, CY: 0.0538, CZ: 0.0715, DE: 0.0844, DK: 0.0770,
  DZ: 0.1050, EC: 0.1180, EG: 0.0830, ES: 0.0755, ET: 0.0680, FI: 0.1150,
  FR: 0.0760, GB: 0.0389, GH: 0.0576, GR: 0.0800, HK: 0.0641, HR: 0.0790,
  HU: 0.0740, ID: 0.2840, IE: 0.0705, IL: 0.0295, IN: 0.0079, IS: 0.0870,
  IT: 0.0760, JO: 0.1010, JP: 0.0725, KE: 0.0525, KR: 0.0364, KW: 0.0396,
  LB: 0.0990, LK: 0.0670, LT: 0.0640, LU: 0.0870, LV: 0.0640, MA: 0.0880,
  MT: 0.0680, MX: 0.0459, MY: 0.0304, NG: 0.0587, NL: 0.0906, NO: 0.0725,
  NP: 0.0640, NZ: 0.0619, OM: 0.0410, PA: 0.0470, PE: 0.0472, PH: 0.2840,
  PK: 0.0530, PL: 0.0430, PR: 0.0075, PT: 0.0464, PY: 0.0940, QA: 0.0620,
  RO: 0.0640, RS: 0.0810, RU: 0.1450, RW: 0.0620, SA: 0.0453, SE: 0.0770,
  SG: 0.0537, SI: 0.0630, SK: 0.0700, SN: 0.0870, TH: 0.0574, TN: 0.0810,
  TR: 0.0219, TW: 0.0680, TZ: 0.0330, UA: 0.1280, UG: 0.0290, US: 0.0040,
  UY: 0.0680, VE: 0.0490, VN: 0.0854, ZA: 0.0360,
};

function round4(n: number) { return Math.round(n * 10000) / 10000; }

export async function runTwilioPricingSync(): Promise<{
  total: number; updated: number; skipped: number; errors: number; rows: SyncRow[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Read the current default markup (falls back to 50%).
  const { data: settingRow } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "default_markup_percent")
    .maybeSingle();
  const defaultMarkup = Number((settingRow?.value as any) ?? 50);

  const { data: countries, error: readErr } = await supabaseAdmin
    .from("country_rates")
    .select("id,country_code,manual_override,markup_percent");
  if (readErr) throw new Error(readErr.message);

  const rows: SyncRow[] = [];
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const c of countries ?? []) {
    const code = String(c.country_code ?? "").toUpperCase();
    const cost = TELNYX_SMS_COST[code];

    if (c.manual_override) {
      rows.push({ country_code: code, status: "skipped_override", message: "Manual override on — sync skipped." });
      skipped++;
      continue;
    }
    if (cost === undefined) {
      rows.push({ country_code: code, status: "no_price", message: "No Telnyx published price for this country yet." });
      skipped++;
      continue;
    }

    const markup = Number(c.markup_percent ?? defaultMarkup);
    const sell = round4(cost * (1 + markup / 100));

    const { error: upErr } = await supabaseAdmin
      .from("country_rates")
      .update({
        cost_price: cost,
        sell_price: sell,
        number_type_used: "sms",
        last_synced_at: now,
        updated_at: now,
      })
      .eq("id", c.id);

    if (upErr) {
      rows.push({ country_code: code, status: "error", message: upErr.message });
      errors++;
      continue;
    }
    rows.push({ country_code: code, status: "ok", cost_price: cost, sell_price: sell, number_type_used: "sms" });
    updated++;
  }

  // Record each row for admin audit (best-effort).
  try {
    const logRows = rows.map((r) => ({
      country_code: r.country_code,
      number_type_used: r.number_type_used ?? null,
      cost_price: r.cost_price ?? null,
      sell_price: r.sell_price ?? null,
      status: r.status,
      message: r.message ?? null,
    }));
    if (logRows.length) await supabaseAdmin.from("pricing_sync_log").insert(logRows);
  } catch { /* log table optional */ }

  return { total: rows.length, updated, skipped, errors, rows };
}
