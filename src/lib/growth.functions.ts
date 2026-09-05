import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return (await resolveActingAccount(userId)).accountId;
}

function slugify(s: string) {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

const jsonObject = z.record(z.string(), z.any());

const SeoFields = {
  logo_url: z.string().trim().max(600).nullable().optional(),
  seo_title: z.string().trim().max(120).nullable().optional(),
  seo_description: z.string().trim().max(300).nullable().optional(),
  og_image_url: z.string().trim().max(600).nullable().optional(),
};

const PageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  headline: z.string().trim().max(160).default(""),
  subheadline: z.string().trim().max(240).default(""),
  body: z.string().trim().max(2000).default(""),
  cta_label: z.string().trim().max(40).default("Sign up"),
  success_message: z.string().trim().max(200).default("Thanks — you are subscribed!"),
  consent_text: z.string().trim().max(400).nullable().optional(),
  theme: z.enum(["light", "dark"]).default("light"),
  accent: z.string().trim().max(20).default("#111827"),
  image_url: z.string().trim().max(600).nullable().optional(),
  design: jsonObject.nullable().optional(),
  blocks: z.array(z.any()).max(400).nullable().optional(),
  builder_theme: jsonObject.nullable().optional(),
  sections: z.array(z.any()).max(30).nullable().optional(),
  ...SeoFields,
  /** Landing pages only: tenants can keep a published page out of search. */
  seo_indexable: z.boolean().optional(),
  list_id: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
});

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  headline: z.string().trim().max(160).default("Get exclusive offers by text"),
  description: z.string().trim().max(400).default(""),
  cta_label: z.string().trim().max(40).default("Subscribe"),
  success_message: z.string().trim().max(200).default("You are on the list!"),
  collect_name: z.boolean().default(true),
  consent_text: z.string().trim().max(400),
  theme: z.enum(["light", "dark"]).default("light"),
  accent: z.string().trim().max(20).default("#111827"),
  design: jsonObject.nullable().optional(),
  blocks: z.array(z.any()).max(400).nullable().optional(),
  builder_theme: jsonObject.nullable().optional(),
  image_url: z.string().trim().max(600).nullable().optional(),
  ...SeoFields,
  list_id: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
});

function publishStamp(published: boolean, existing: string | null | undefined) {
  if (!published) return existing ?? null;
  return existing ?? new Date().toISOString();
}

export const listLandingPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data } = await supabaseAdmin
      .from("landing_pages")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const saveLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { id, ...rest } = data;
    if (id) {
      const { data: existing } = await supabaseAdmin
        .from("landing_pages")
        .select("published_at")
        .eq("id", id)
        .eq("account_id", accountId)
        .maybeSingle();
      const { error } = await supabaseAdmin
        .from("landing_pages")
        .update({
          ...rest,
          published_at: publishStamp(rest.published, (existing as any)?.published_at),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("landing_pages")
      .insert({
        ...rest,
        account_id: accountId,
        slug: slugify(data.name),
        published_at: publishStamp(rest.published, null),
      } as any)
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const deleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin.from("landing_pages").delete().eq("id", data.id).eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: src } = await supabaseAdmin
      .from("landing_pages")
      .select("*")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!src) throw new Error("Page not found");
    const { id, created_at, updated_at, views, submissions, slug, name, ...rest } = src as any;
    const { data: created, error } = await supabaseAdmin
      .from("landing_pages")
      .insert({ ...rest, account_id: accountId, name: `${name} copy`, slug: slugify(name), published: false, published_at: null })
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const listSignupForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data } = await supabaseAdmin
      .from("signup_forms")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const saveSignupForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FormSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { id, ...rest } = data;
    if (id) {
      const { data: existing } = await supabaseAdmin
        .from("signup_forms")
        .select("published_at")
        .eq("id", id)
        .eq("account_id", accountId)
        .maybeSingle();
      const { error } = await supabaseAdmin
        .from("signup_forms")
        .update({
          ...rest,
          published_at: publishStamp(rest.published, (existing as any)?.published_at),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("signup_forms")
      .insert({
        ...rest,
        account_id: accountId,
        slug: slugify(data.name),
        published_at: publishStamp(rest.published, null),
      } as any)
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const deleteSignupForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { error } = await supabaseAdmin.from("signup_forms").delete().eq("id", data.id).eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateSignupForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: src } = await supabaseAdmin
      .from("signup_forms")
      .select("*")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!src) throw new Error("Form not found");
    const { id, created_at, updated_at, views, submissions, slug, name, ...rest } = src as any;
    const { data: created, error } = await supabaseAdmin
      .from("signup_forms")
      .insert({ ...rest, account_id: accountId, name: `${name} copy`, slug: slugify(name), published: false, published_at: null })
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const listRecentSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data } = await supabaseAdmin
      .from("subscribe_submissions")
      .select("id,source_type,source_id,phone_e164,first_name,created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

/** Views / signups / conversion rate per landing page and sign-up form. */
export const getWebsiteAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const [pages, forms, subs] = await Promise.all([
      supabaseAdmin.from("landing_pages").select("id,name,slug,views,submissions,published").eq("account_id", accountId),
      supabaseAdmin.from("signup_forms").select("id,name,slug,views,submissions,published").eq("account_id", accountId),
      supabaseAdmin
        .from("subscribe_submissions")
        .select("source_id,created_at")
        .eq("account_id", accountId)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(20000),
    ]);

    const last30 = new Map<string, number>();
    for (const s of (subs.data ?? []) as any[]) last30.set(s.source_id, (last30.get(s.source_id) ?? 0) + 1);

    const shape = (rows: any[], kind: "landing_page" | "signup_form") =>
      rows.map((r) => ({
        id: r.id as string,
        kind,
        name: r.name as string,
        slug: r.slug as string,
        published: !!r.published,
        views: Number(r.views ?? 0),
        submissions: Number(r.submissions ?? 0),
        last30: last30.get(r.id) ?? 0,
        rate: Number(r.views ?? 0) > 0 ? Number(r.submissions ?? 0) / Number(r.views) : 0,
      }));

    const items = [...shape((pages.data ?? []) as any[], "landing_page"), ...shape((forms.data ?? []) as any[], "signup_form")];
    return {
      items,
      totals: {
        views: items.reduce((a, i) => a + i.views, 0),
        submissions: items.reduce((a, i) => a + i.submissions, 0),
        last30: items.reduce((a, i) => a + i.last30, 0),
      },
    };
  });

/** Leads captured by one page/form (or everything), ready for CSV export. */
export const exportWebsiteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sourceId: z.string().uuid().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    let q = supabaseAdmin
      .from("subscribe_submissions")
      .select("phone_e164,first_name,last_name,source_type,created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (data.sourceId) q = q.eq("source_id", data.sourceId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as {
      phone_e164: string;
      first_name: string | null;
      last_name: string | null;
      source_type: string;
      created_at: string;
    }[];
  });
