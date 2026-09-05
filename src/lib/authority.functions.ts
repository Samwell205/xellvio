/**
 * Admin-only server functions for the authority & distribution engine.
 *
 * Everything here is gated on the `admin` role. Nothing in this module sends
 * email, scrapes third parties or contacts anyone: outreach is drafted here and
 * sent by a human from their own mailbox, which keeps the system compliant with
 * the no-mass-outreach rule.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden: admin only");
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Tables this module is allowed to touch, with their default sort column. */
const TABLES = {
  authority_opportunities: "created_at",
  authority_mentions: "found_at",
  authority_directories: "created_at",
  authority_assets: "created_at",
  authority_distribution: "created_at",
  authority_partners: "created_at",
  authority_referrals: "created_at",
} as const;
export type AuthorityTable = keyof typeof TABLES;

const tableSchema = z.enum(Object.keys(TABLES) as [AuthorityTable, ...AuthorityTable[]]);

export const authorityList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: AuthorityTable }) =>
    z.object({ table: tableSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const { data: rows, error } = await client
      .from(data.table)
      .select("*")
      .order(TABLES[data.table], { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

const saveSchema = z.object({
  table: tableSchema,
  id: z.string().uuid().optional(),
  values: z.record(z.string(), z.any()),
});

/** Insert or update one record. Empty strings are stored as NULL. */
export const authoritySave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.values)) {
      values[k] = v === "" ? null : v;
    }
    if (data.table === "authority_opportunities" && !data.id) {
      values.created_by = context.userId;
    }
    if (data.id) {
      const { data: row, error } = await client
        .from(data.table)
        .update(values)
        .eq("id", data.id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row as any;
    }
    const { data: row, error } = await client
      .from(data.table)
      .insert(values)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as any;
  });

export const authorityDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ table: tableSchema, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const { error } = await client.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Brand profile is a single row; created on first read. */
export const authorityGetBrandProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const { data: row } = await client.from("authority_brand_profile").select("*").limit(1).maybeSingle();
    if (row) return row as any;
    const { data: created, error } = await client
      .from("authority_brand_profile")
      .insert({ brand_name: "Xellvio", website_url: "https://xellvio.com" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return created as any;
  });

export const authoritySaveBrandProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), values: z.record(z.string(), z.any()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const { data: row, error } = await client
      .from("authority_brand_profile")
      .update(data.values)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as any;
  });

/** Append one outreach interaction to an opportunity's history. */
export const authorityLogOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        opportunity_id: z.string().uuid(),
        direction: z.enum(["sent", "received", "note"]),
        channel: z.string().max(80).optional(),
        summary: z.string().min(1).max(4000),
        stage: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const now = new Date().toISOString();
    const { error } = await client.from("authority_outreach_log").insert({
      opportunity_id: data.opportunity_id,
      direction: data.direction,
      channel: data.channel ?? null,
      summary: data.summary,
      occurred_at: now,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    const patch: Record<string, unknown> = {};
    if (data.direction === "sent") patch.last_contact_at = now;
    if (data.stage) patch.stage = data.stage;
    if (Object.keys(patch).length) {
      await client.from("authority_opportunities").update(patch).eq("id", data.opportunity_id);
    }
    return { ok: true };
  });

export const authorityOutreachHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { opportunity_id: string }) =>
    z.object({ opportunity_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const client = await db();
    const { data: rows, error } = await client
      .from("authority_outreach_log")
      .select("*")
      .eq("opportunity_id", data.opportunity_id)
      .order("occurred_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export type AuthorityKpis = {
  opportunities: number;
  byStage: Record<string, number>;
  byQuality: Record<string, number>;
  linksEarned: number;
  contactedThisMonth: number;
  mentions: { total: number; unlinked: number; unreviewed: number };
  directories: { total: number; live: number };
  assets: { total: number; published: number; research: number };
  distribution: { total: number; scheduled: number };
  partners: { total: number; published: number };
  referrals: { visitors: number; signups: number; sources: number };
  topSources: { source_name: string; visitors: number; signups: number }[];
  needsFollowUp: { id: string; website_name: string; last_contact_at: string | null; stage: string }[];
};

export const authorityKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuthorityKpis> => {
    await assertAdmin(context.supabase);
    const client = await db();
    const [opps, mentions, dirs, assets, dist, partners, referrals] = await Promise.all([
      client.from("authority_opportunities").select("id,website_name,stage,quality,last_contact_at").limit(2000),
      client.from("authority_mentions").select("id,link_state,review_status").limit(2000),
      client.from("authority_directories").select("id,status").limit(500),
      client.from("authority_assets").select("id,status,is_research").limit(500),
      client.from("authority_distribution").select("id,status,scheduled_for").limit(1000),
      client.from("authority_partners").select("id,published").limit(500),
      client.from("authority_referrals").select("source_name,visitors,signups").limit(2000),
    ]);

    const oppRows: any[] = opps.data ?? [];
    const byStage: Record<string, number> = {};
    const byQuality: Record<string, number> = {};
    for (const o of oppRows) {
      byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
      byQuality[o.quality] = (byQuality[o.quality] ?? 0) + 1;
    }
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const refRows: any[] = referrals.data ?? [];
    const bySource = new Map<string, { visitors: number; signups: number }>();
    for (const r of refRows) {
      const cur = bySource.get(r.source_name) ?? { visitors: 0, signups: 0 };
      cur.visitors += r.visitors ?? 0;
      cur.signups += r.signups ?? 0;
      bySource.set(r.source_name, cur);
    }
    const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return {
      opportunities: oppRows.length,
      byStage,
      byQuality,
      linksEarned: byStage["link_earned"] ?? 0,
      contactedThisMonth: oppRows.filter(
        (o) => o.last_contact_at && new Date(o.last_contact_at) >= monthStart,
      ).length,
      mentions: {
        total: (mentions.data ?? []).length,
        unlinked: (mentions.data ?? []).filter((m: any) => m.link_state === "unlinked").length,
        unreviewed: (mentions.data ?? []).filter((m: any) => m.review_status !== "reviewed").length,
      },
      directories: {
        total: (dirs.data ?? []).length,
        live: (dirs.data ?? []).filter((d: any) => d.status === "live").length,
      },
      assets: {
        total: (assets.data ?? []).length,
        published: (assets.data ?? []).filter((a: any) => a.status === "published").length,
        research: (assets.data ?? []).filter((a: any) => a.is_research).length,
      },
      distribution: {
        total: (dist.data ?? []).length,
        scheduled: (dist.data ?? []).filter((d: any) => d.scheduled_for).length,
      },
      partners: {
        total: (partners.data ?? []).length,
        published: (partners.data ?? []).filter((p: any) => p.published).length,
      },
      referrals: {
        visitors: refRows.reduce((s, r) => s + (r.visitors ?? 0), 0),
        signups: refRows.reduce((s, r) => s + (r.signups ?? 0), 0),
        sources: bySource.size,
      },
      topSources: [...bySource.entries()]
        .map(([source_name, v]) => ({ source_name, ...v }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 8),
      needsFollowUp: oppRows
        .filter(
          (o) =>
            o.stage === "contacted" &&
            o.last_contact_at &&
            new Date(o.last_contact_at).getTime() < staleCutoff,
        )
        .slice(0, 12)
        .map((o) => ({
          id: o.id,
          website_name: o.website_name,
          last_contact_at: o.last_contact_at,
          stage: o.stage,
        })),
    };
  });
