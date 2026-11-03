import { assertPermission, resolveActingAccount } from "@/lib/acting-account.server";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Free phone-type screening (owner decision 2026-11-03: no paid lookups).
 *
 * Uses official numbering-plan data offline — no carrier request, no charge to
 * anyone. Only numbers whose pattern is definitely a landline or toll-free line
 * are blocked; numbers that could be mobile (e.g. all of US/Canada share
 * ranges) stay "unknown" and are never blocked.
 */

export type LineType = "mobile" | "voip" | "landline" | "toll_free" | "unknown";

/** Line types that can never receive a text message. */
export const NON_TEXTABLE: LineType[] = ["landline", "toll_free"];

export function isTextable(lineType: string | null | undefined): boolean {
  if (!lineType) return true; // unchecked / unknown → never block
  return !NON_TEXTABLE.includes(lineType as LineType);
}

/** Classify a number from numbering-plan patterns only (free, offline). */
export function classifyOffline(phone: string): LineType {
  const parsed = parsePhoneNumberFromString(phone);
  if (!parsed || !parsed.isValid()) return "unknown";
  switch (parsed.getType()) {
    case "MOBILE": return "mobile";
    case "VOIP": return "voip";
    case "FIXED_LINE": return "landline";
    case "TOLL_FREE": return "toll_free";
    default: return "unknown"; // FIXED_LINE_OR_MOBILE, shared cost, etc.
  }
}

export type ScreenResult = {
  checked: number;
  cached: number;
  newLookups: number;
  mobile: number;
  voip: number;
  landline: number;
  toll_free: number;
  unknown: number;
  blocked: number;
  /** Always 0 — checks are free. Kept for UI compatibility. */
  charged: number;
};

function emptyResult(): ScreenResult {
  return { checked: 0, cached: 0, newLookups: 0, mobile: 0, voip: 0, landline: 0, toll_free: 0, unknown: 0, blocked: 0, charged: 0 };
}

/** Screen a concrete set of E.164 phones for one account. */
async function screenPhoneSet(accountId: string, phones: string[]): Promise<ScreenResult> {
  const result = emptyResult();
  if (!phones.length) return result;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  // 1) Reuse cached lookups.
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

  // 2) Classify the rest offline (free).
  const missing = phones.filter((p) => !cache.has(p));
  for (const phone of missing) cache.set(phone, { line_type: classifyOffline(phone), carrier_name: null });
  result.newLookups = missing.length;

  // 3) Stamp contacts and block non-textable numbers from future campaigns.
  const now = new Date().toISOString();
  const byType = new Map<LineType, string[]>();
  const blockPhones: string[] = [];
  for (const phone of phones) {
    const hit = cache.get(phone);
    if (!hit) continue;
    result.checked += 1;
    result[hit.line_type] += 1;
    const list = byType.get(hit.line_type) ?? [];
    list.push(phone);
    byType.set(hit.line_type, list);
    if (NON_TEXTABLE.includes(hit.line_type)) blockPhones.push(phone);
  }

  for (const [lineType, list] of byType) {
    for (let i = 0; i < list.length; i += 500) {
      await admin
        .from("profiles")
        .update({ line_type: lineType, line_type_checked_at: now })
        .eq("account_id", accountId)
        .in("phone_e164", list.slice(i, i + 500));
    }
  }

  const uniqueBlocked = Array.from(new Set(blockPhones));
  for (let i = 0; i < uniqueBlocked.length; i += 500) {
    const chunk = uniqueBlocked.slice(i, i + 500).map((phone) => ({
      phone_e164: phone,
      error_code: "line_type",
      reason: "Phone type check: this line cannot receive text messages",
      first_seen_at: now,
      last_seen_at: now,
    }));
    await admin.from("unroutable_numbers").upsert(chunk, { onConflict: "phone_e164" });
  }
  result.blocked = uniqueBlocked.length;

  return result;
}

export async function screenLineTypesForUser(
  userId: string,
  opts: { listId?: string | null; limit?: number } = {},
): Promise<ScreenResult & { remaining: number }> {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "audience");
  const accountId = acting.accountId;


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
      return { ...emptyResult(), remaining: 0 };
    }
    query = query.in("id", memberIds.slice(0, 50_000));
  }

  const { data: candidates, error } = await query;
  if (error) throw error;
  const rows: Array<{ id: string; phone_e164: string }> = (candidates ?? []).slice(0, limit);
  const overLimit = (candidates ?? []).length > limit;

  const result = await screenPhoneSet(accountId, Array.from(new Set(rows.map((r) => r.phone_e164))));

  if (overLimit) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("line_type", null);
    return { ...result, remaining: count ?? 0 };
  }

  return { ...result, remaining: 0 };
}

/** Screen explicit phone numbers (e.g. straight from a CSV upload). */
export async function screenExplicitPhonesForUser(userId: string, phonesInput: string[]): Promise<ScreenResult> {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "audience");
  const phones = Array.from(new Set(phonesInput))
    .filter((p) => /^\+[1-9][0-9]{6,14}$/.test(p))
    .slice(0, 2000);
  return screenPhoneSet(acting.accountId, phones);
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

export async function getUploadScreeningSettingForUser(userId: string) {
  const acting = await resolveActingAccount(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("accounts")
    .select("auto_screen_uploads")
    .eq("id", acting.accountId)
    .maybeSingle();
  return {
    enabled: Boolean(data?.auto_screen_uploads),
    canEdit: acting.isOwner || (acting.role !== "viewer" && acting.permissions.settings === true),
  };
}

export async function saveUploadScreeningSettingForUser(userId: string, enabled: boolean) {
  const acting = await resolveActingAccount(userId);
  const canEdit = acting.isOwner || (acting.role !== "viewer" && acting.permissions.settings === true);
  if (!canEdit) throw new Error("You don't have permission to change business settings.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("accounts")
    .update({ auto_screen_uploads: enabled })
    .eq("id", acting.accountId);
  if (error) throw new Error("Could not save the phone checking setting.");
  return { enabled };
}
