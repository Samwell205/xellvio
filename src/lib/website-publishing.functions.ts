/**
 * Draft vs published designs, editable web addresses and version history for
 * landing pages and sign-up forms. Editing only ever touches the draft; the
 * live page changes when the tenant presses Publish.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KIND = z.enum(["page", "form"]);
type Kind = z.infer<typeof KIND>;

const TABLE: Record<Kind, "landing_pages" | "signup_forms"> = {
  page: "landing_pages",
  form: "signup_forms",
};

export const RESERVED_SLUGS = [
  "app",
  "admin",
  "api",
  "auth",
  "p",
  "f",
  "s",
  "media",
  "assets",
  "static",
  "login",
  "logout",
  "signup",
  "pricing",
  "legal",
  "privacy",
  "terms",
  "support",
  "docs",
  "mcp",
  "new",
  "edit",
];

export function normalizeSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function acct(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return (await resolveActingAccount(userId)).accountId;
}

/** Rename the public web address of a page or form. */
export const updateWebsiteSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: KIND, id: z.string().uuid(), slug: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const slug = normalizeSlug(data.slug);
    if (slug.length < 3) throw new Error("Use at least 3 letters or numbers.");
    if (RESERVED_SLUGS.includes(slug)) throw new Error(`"${slug}" is reserved — please pick another address.`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const table = TABLE[data.kind];

    const { data: clash } = await supabaseAdmin.from(table).select("id").eq("slug", slug).neq("id", data.id).maybeSingle();
    if (clash) throw new Error("That address is already taken. Try another one.");

    const { error } = await supabaseAdmin
      .from(table)
      .update({ slug })
      .eq("id", data.id)
      .eq("account_id", accountId);
    if (error) throw new Error(error.message);
    return { slug };
  });

/** Copy the current draft design to the live page and store a version. */
export const publishWebsiteDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: KIND, id: z.string().uuid(), label: z.string().trim().max(120).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const table = TABLE[data.kind];

    const { data: row } = await supabaseAdmin
      .from(table)
      .select("id,slug,blocks,builder_theme,published_version")
      .eq("id", data.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!row) throw new Error("This design could not be found.");

    const blocks = (row as any).blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) throw new Error("Add some content before publishing.");

    const version = Number((row as any).published_version ?? 0) + 1;
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from(table)
      .update({
        published: true,
        published_blocks: blocks,
        published_theme: (row as any).builder_theme,
        published_version: version,
        last_published_at: now,
        published_at: now,
      } as any)
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("website_versions").insert({
      account_id: accountId,
      kind: data.kind,
      resource_id: row.id,
      version,
      label: data.label || `Version ${version}`,
      blocks,
      builder_theme: (row as any).builder_theme,
      created_by: context.userId,
    });

    return { version, slug: (row as any).slug as string, publishedAt: now };
  });

/** Take the live page offline without touching the draft. */
export const unpublishWebsiteDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kind: KIND, id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    await supabaseAdmin
      .from(TABLE[data.kind])
      .update({ published: false })
      .eq("id", data.id)
      .eq("account_id", accountId);
    return { ok: true };
  });

export const listWebsiteVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kind: KIND, id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("website_versions")
      .select("id,version,label,created_at,blocks,builder_theme")
      .eq("resource_id", data.id)
      .eq("account_id", accountId)
      .eq("kind", data.kind)
      .order("version", { ascending: false })
      .limit(40);
    return rows ?? [];
  });

/** Load an old version back into the draft (the live page is untouched). */
export const restoreWebsiteVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kind: KIND, versionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountId = await acct(context.userId);
    const { data: version } = await supabaseAdmin
      .from("website_versions")
      .select("resource_id,blocks,builder_theme,version")
      .eq("id", data.versionId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!version) throw new Error("That version could not be found.");

    await supabaseAdmin
      .from(TABLE[data.kind])
      .update({ blocks: version.blocks, builder_theme: version.builder_theme } as any)
      .eq("id", version.resource_id)
      .eq("account_id", accountId);

    return { blocks: version.blocks, theme: version.builder_theme, version: version.version };
  });
