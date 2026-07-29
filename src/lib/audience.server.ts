import { assertPermission, resolveActingAccount } from "@/lib/acting-account.server";

export type AudienceProfileRow = {
  id: string;
  phone_e164: string;
  first_name: string | null;
  last_name: string | null;
  country_code: string | null;
  created_at: string;
  consent_status: "subscribed" | "unsubscribed" | "pending";
  list_ids: string[];
};

export type AudienceContactList = { id: string; name: string; description: string | null };

async function getAudienceAccountId(userId: string) {
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "audience");
  return acting.accountId;
}

export async function listAudienceContactListsForUser(userId: string): Promise<AudienceContactList[]> {
  const accountId = await getAudienceAccountId(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("contact_lists")
    .select("id,name,description")
    .eq("account_id", accountId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getAudienceStatsForUser(userId: string) {
  const accountId = await getAudienceAccountId(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const [{ count: total }, { count: subs }, { count: supp }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    admin
      .from("consents")
      .select("id,profiles!inner(account_id)", { count: "exact", head: true })
      .eq("profiles.account_id", accountId)
      .eq("status", "subscribed")
      .eq("channel", "sms"),
    admin.from("suppressions").select("id", { count: "exact", head: true }).eq("account_id", accountId),
  ]);
  return { total: total ?? 0, subs: subs ?? 0, supp: supp ?? 0 };
}

export async function getAudienceListCountsForUser(userId: string) {
  const accountId = await getAudienceAccountId(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: lists, error } = await admin
    .from("contact_lists")
    .select("id")
    .eq("account_id", accountId);
  if (error) throw error;

  const out: Record<string, number> = {};
  await Promise.all((lists ?? []).map(async (list: { id: string }) => {
    const { count } = await admin
      .from("profile_list_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("list_id", list.id);
    out[list.id] = count ?? 0;
  }));
  return out;
}

export async function listAudienceProfilesForUser(userId: string, listId: string | null): Promise<AudienceProfileRow[]> {
  const accountId = await getAudienceAccountId(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  let profiles: any[] = [];
  if (listId) {
    const { data: list } = await admin
      .from("contact_lists")
      .select("id")
      .eq("account_id", accountId)
      .eq("id", listId)
      .maybeSingle();
    if (!list) return [];

    const profileIds: string[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin
        .from("profile_list_members")
        .select("profile_id")
        .eq("account_id", accountId)
        .eq("list_id", listId)
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const ids = (data ?? []).map((row: { profile_id: string }) => row.profile_id);
      profileIds.push(...ids);
      if (ids.length < pageSize) break;
    }
    if (profileIds.length === 0) return [];

    for (let i = 0; i < profileIds.length; i += 500) {
      const { data, error } = await admin
        .from("profiles")
        .select("id,phone_e164,first_name,last_name,country_code,created_at,consents(status,channel)")
        .eq("account_id", accountId)
        .in("id", profileIds.slice(i, i + 500));
      if (error) throw error;
      profiles.push(...(data ?? []));
    }
  } else {
    const { data, error } = await admin
      .from("profiles")
      .select("id,phone_e164,first_name,last_name,country_code,created_at,consents(status,channel)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    profiles = data ?? [];
  }

  const mapped: AudienceProfileRow[] = profiles.map((profile) => {
    const sms = (profile.consents ?? []).find((consent: { channel: string }) => consent.channel === "sms");
    return {
      id: profile.id,
      phone_e164: profile.phone_e164,
      first_name: profile.first_name,
      last_name: profile.last_name,
      country_code: profile.country_code,
      created_at: profile.created_at,
      consent_status: sms?.status ?? "pending",
      list_ids: [],
    };
  });

  if (mapped.length > 0) {
    const byProfile: Record<string, string[]> = {};
    for (let i = 0; i < mapped.length; i += 500) {
      const { data: memberships } = await admin
        .from("profile_list_members")
        .select("profile_id,list_id")
        .eq("account_id", accountId)
        .in("profile_id", mapped.slice(i, i + 500).map((profile) => profile.id));
      for (const membership of memberships ?? []) {
        (byProfile[membership.profile_id] ||= []).push(membership.list_id);
      }
    }
    for (const profile of mapped) profile.list_ids = byProfile[profile.id] ?? [];
  }

  mapped.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return mapped;
}