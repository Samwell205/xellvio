import { assertPermission, resolveActingAccount } from "@/lib/acting-account.server";

/**
 * Carrier line-type screening.
 *
 * Landline and toll-free destinations physically cannot receive SMS: the
 * carrier finalises them as 40001 ("non-routable"), the message is billed and
 * nothing arrives. Screening numbers up front keeps them out of campaigns.
 *
 * Results are cached in public.phone_line_types so a number is only ever
 * looked up (and billed) once, across all tenants.
 */

export type LineType = "mobile" | "voip" | "landline" | "toll_free" | "unknown";

const LOOKUP_CONCURRENCY = 20;

/** Line types that can never receive a text message. */
export const NON_TEXTABLE: LineType[] = ["landline", "toll_free"];

export function isTextable(lineType: string | null | undefined): boolean {
  if (!lineType) return true; // unchecked / unknown → never block
  return !NON_TEXTABLE.includes(lineType as LineType);
}

function normalizeType(raw: string | null | undefined): LineType {
  const t = (raw ?? "").toLowerCase().trim();
  if (t === "mobile" || t === "wireless") return "mobile";
  if (t === "voip") return "voip";
  if (t === "fixed line" || t === "landline") return "landline";
  if (t === "toll free" || t === "toll-free") return "toll_free";
  // "fixed line or mobile", "other", "" → cannot be ruled out, keep sendable
  return "unknown";
}

async function lookupOne(
  phone: string,
  key: string,
): Promise<{ line_type: LineType; carrier_name: string | null } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(phone)}?type=carrier`,
        { headers: { Authorization: `Bearer ${key}` } },
      );
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      const body: any = await res.json();
      const carrier = body?.data?.carrier ?? {};
      return {
        line_type: normalizeType(carrier?.type),
        carrier_name: carrier?.name ?? null,
      };
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export type ScreenResult = {
  checked: number;
  cached: number;
  mobile: number;
  voip: number;
  landline: number;
  toll_free: number;
  unknown: number;
  blocked: number;
  remaining: number;
};

export async function screenLineTypesForUser(
  userId: string,
  opts: { listId?: string | null; limit?: number } = {},
): Promise<ScreenResult> {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "audience");
  const accountId = acting.accountId;

  const key = process.env['TELNYX_API_KEY'];
  if (!key) throw new Error("Phone type checking is not configured");

  const limit = Math.min(Math.max(opts.limit ?? 2000, 1), 5000);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  // Candidate contacts: never screened before.
  let query = admin
    .from("profiles")
    .select("id,phone_e164")
    .eq("account_id", accountId)
    .is("line_type", null)
    .limit(limit + 1);

  if (opts.listId) {
    const memberIds: string[] = [];
    for (let from = 0; from < 200_000; from += 1000) {
      const { data: page } = await admin
        .from("profile_list_members")
        .select("profile_id")
        .eq("account_id", accountId)
        .eq("list_id", opts.listId)
        .range(from, from + 999);
      memberIds.push(...(page ?? []).map((r: any) => r.profile_id));
      if (!page || page.length < 1000) break;
    }
    if (!memberIds.length) {
      return { checked: 0, cached: 0, mobile: 0, voip: 0, landline: 0, toll_free: 0, unknown: 0, blocked: 0, remaining: 0 };
    }
    query = query.in("id", memberIds.slice(0, 50_000));
  }

  const { data: candidates, error } = await query;
  if (error) throw error;
  const rows: Array<{ id: string; phone_e164: string }> = (candidates ?? []).slice(0, limit);
  const remaining = (candidates ?? []).length > limit ? 1 : 0;

  const result: ScreenResult = {
    checked: 0,
    cached: 0,
    mobile: 0,
    voip: 0,
    landline: 0,
    toll_free: 0,
    unknown: 0,
    blocked: 0,
    remaining: 0,
  };
  if (!rows.length) return result;

  // 1) Reuse cached lookups.
  const phones = Array.from(new Set(rows.map((r) => r.phone_e164)));
  const cache = new Map<string, { line_type: LineType; carrier_name: string | null }>();
  for (let i = 0; i < phones.length; i += 500) {
    const { data: hits } = await admin
      .from("phone_line_types")
      .select("phone_e164,line_type,carrier_name")
      .in("phone_e164", phones.slice(i, i + 500));
    for (const h of hits ?? []) {
      cache.set(h.phone_e164, { line_type: h.line_type as LineType, carrier_name: h.carrier_name });
    }
  }
  result.cached = cache.size;

  // 2) Look up the rest with the carrier.
  const missing = phones.filter((p) => !cache.has(p));
  const fetched = await mapLimit(missing, LOOKUP_CONCURRENCY, async (phone) => {
    const r = await lookupOne(phone, key);
    return { phone, r };
  });
  const toCache: any[] = [];
  for (const { phone, r } of fetched) {
    if (!r) continue;
    cache.set(phone, r);
    toCache.push({ phone_e164: phone, line_type: r.line_type, carrier_name: r.carrier_name, checked_at: new Date().toISOString() });
  }
  for (let i = 0; i < toCache.length; i += 500) {
    await admin.from("phone_line_types").upsert(toCache.slice(i, i + 500), { onConflict: "phone_e164" });
  }

  // 3) Stamp contacts and block non-textable numbers from future campaigns.
  const now = new Date().toISOString();
  const byType = new Map<LineType, string[]>();
  const blockPhones: string[] = [];
  for (const row of rows) {
    const hit = cache.get(row.phone_e164);
    if (!hit) continue;
    result.checked += 1;
    result[hit.line_type === "toll_free" ? "toll_free" : hit.line_type] += 1;
    const list = byType.get(hit.line_type) ?? [];
    list.push(row.id);
    byType.set(hit.line_type, list);
    if (NON_TEXTABLE.includes(hit.line_type)) blockPhones.push(row.phone_e164);
  }

  for (const [lineType, ids] of byType) {
    for (let i = 0; i < ids.length; i += 500) {
      await admin
        .from("profiles")
        .update({ line_type: lineType, line_type_checked_at: now })
        .in("id", ids.slice(i, i + 500));
    }
  }

  const uniqueBlocked = Array.from(new Set(blockPhones));
  for (let i = 0; i < uniqueBlocked.length; i += 500) {
    const chunk = uniqueBlocked.slice(i, i + 500).map((phone) => ({
      phone_e164: phone,
      error_code: "line_type",
      reason: "Carrier lookup: this line cannot receive text messages",
      first_seen_at: now,
      last_seen_at: now,
    }));
    await admin.from("unroutable_numbers").upsert(chunk, { onConflict: "phone_e164" });
  }
  result.blocked = uniqueBlocked.length;

  if (remaining) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("line_type", null);
    result.remaining = count ?? 0;
  }

  return result;
}

export async function getLineTypeStatsForUser(userId: string) {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "audience");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const count = async (filter: (q: any) => any) => {
    const q = admin.from("profiles").select("id", { count: "exact", head: true }).eq("account_id", acting.accountId);
    const { count: c } = await filter(q);
    return c ?? 0;
  };

  const [unchecked, mobile, voip, landline, tollFree, unknown] = await Promise.all([
    count((q: any) => q.is("line_type", null)),
    count((q: any) => q.eq("line_type", "mobile")),
    count((q: any) => q.eq("line_type", "voip")),
    count((q: any) => q.eq("line_type", "landline")),
    count((q: any) => q.eq("line_type", "toll_free")),
    count((q: any) => q.eq("line_type", "unknown")),
  ]);

  return { unchecked, mobile, voip, landline, toll_free: tollFree, unknown, non_textable: landline + tollFree };
}
