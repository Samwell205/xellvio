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

const PageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  headline: z.string().trim().max(160).default(""),
  subheadline: z.string().trim().max(240).default(""),
  body: z.string().trim().max(2000).default(""),
  cta_label: z.string().trim().max(40).default("Sign up"),
  success_message: z.string().trim().max(200).default("Thanks — you are subscribed!"),
  theme: z.enum(["light", "dark"]).default("light"),
  accent: z.string().trim().max(20).default("#111827"),
  image_url: z.string().trim().max(600).nullable().optional(),
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
  list_id: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
});

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
      const { error } = await supabaseAdmin
        .from("landing_pages")
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("landing_pages")
      .insert({ ...rest, account_id: accountId, slug: slugify(data.name) })
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
      const { error } = await supabaseAdmin
        .from("signup_forms")
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("signup_forms")
      .insert({ ...rest, account_id: accountId, slug: slugify(data.name) })
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
