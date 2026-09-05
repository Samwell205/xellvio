// Developer Portal server functions: profile, apps, capabilities, API keys, analytics.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
  `app-${Date.now()}`;

export const getDeveloperOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await db();
    const { data: dev } = await sb
      .from("developers")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!dev) return { developer: null, apps: [], stats: null, apiKeys: [] };

    const { data: apps } = await sb
      .from("apps")
      .select("id, name, slug, status, visibility, version, install_count, rating, category_id, auth_type, submitted_at, review_notes, updated_at")
      .eq("developer_id", dev.id)
      .order("updated_at", { ascending: false });

    const appIds = (apps ?? []).map((a) => a.id);
    const [installs, logs, webhooks, keys] = await Promise.all([
      appIds.length
        ? sb.from("app_installations").select("id, status, workspace_id", { count: "exact" }).in("app_id", appIds)
        : Promise.resolve({ data: [], count: 0 } as any),
      appIds.length
        ? sb.from("integration_logs").select("id, status", { count: "exact" }).in("app_id", appIds).limit(1000)
        : Promise.resolve({ data: [], count: 0 } as any),
      appIds.length
        ? sb.from("webhook_events").select("id", { count: "exact", head: true }).in("app_id", appIds)
        : Promise.resolve({ count: 0 } as any),
      sb
        .from("developer_api_keys")
        .select("id, name, key_prefix, last_used_at, revoked_at, created_at")
        .eq("developer_id", dev.id)
        .order("created_at", { ascending: false }),
    ]);

    const logRows = (logs.data ?? []) as { status: string }[];
    const installRows = (installs.data ?? []) as { status: string; workspace_id: string }[];

    return {
      developer: dev,
      apps: apps ?? [],
      apiKeys: keys.data ?? [],
      stats: {
        totalApps: (apps ?? []).length,
        publishedApps: (apps ?? []).filter((a) => a.status === "published").length,
        totalInstalls: installRows.length,
        activeWorkspaces: new Set(installRows.filter((r) => r.status === "installed").map((r) => r.workspace_id)).size,
        apiRequests: logRows.length,
        webhookEvents: webhooks.count ?? 0,
        errors: logRows.filter((r) => r.status !== "ok").length,
      },
    };
  });

export const saveDeveloperProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyName: z.string().trim().min(2).max(120),
        website: z.string().trim().max(300).optional().or(z.literal("")),
        supportEmail: z.string().trim().email().optional().or(z.literal("")),
        description: z.string().trim().max(2000).optional().or(z.literal("")),
        logoUrl: z.string().trim().max(600).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await db();
    const payload = {
      user_id: context.userId,
      company_name: data.companyName,
      website: data.website || null,
      support_email: data.supportEmail || null,
      description: data.description || null,
      logo_url: data.logoUrl || null,
    };
    const { data: existing } = await sb.from("developers").select("id").eq("user_id", context.userId).maybeSingle();
    if (existing) {
      const { error } = await sb.from("developers").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { developerId: existing.id };
    }
    const { data: created, error } = await sb.from("developers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { developerId: created.id };
  });

const capabilitySchema = z.array(
  z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().max(80).optional(), description: z.string().trim().max(400).optional(), entity: z.string().trim().max(40).optional() }),
).max(40);

const appSchema = z.object({
  appId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  categoryId: z.string().uuid().nullable().optional(),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(300).optional().or(z.literal("")),
  longDescription: z.string().trim().max(8000).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(600).optional().or(z.literal("")),
  websiteUrl: z.string().trim().max(600).optional().or(z.literal("")),
  documentationUrl: z.string().trim().max(600).optional().or(z.literal("")),
  privacyUrl: z.string().trim().max(600).optional().or(z.literal("")),
  setupGuide: z.string().trim().max(4000).optional().or(z.literal("")),
  authType: z.enum(["oauth2", "api_key", "bearer_token", "custom"]),
  pricingType: z.enum(["free", "paid", "freemium"]).default("free"),
  keywords: z.array(z.string().trim().max(40)).max(20).default([]),
  authConfig: z
    .object({
      base_api_url: z.string().trim().max(400).optional().or(z.literal("")),
      authorization_url: z.string().trim().max(400).optional().or(z.literal("")),
      token_url: z.string().trim().max(400).optional().or(z.literal("")),
      scopes: z.string().trim().max(600).optional().or(z.literal("")),
      webhook_url: z.string().trim().max(400).optional().or(z.literal("")),
    })
    .default({}),
  actions: capabilitySchema.default([]),
  triggers: capabilitySchema.default([]),
});

export const saveDeveloperApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => appSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await db();
    const { data: dev } = await sb.from("developers").select("id, developer_status").eq("user_id", context.userId).maybeSingle();
    if (!dev) throw new Error("Create your developer profile first.");
    if (dev.developer_status !== "active") throw new Error("Your developer account is not active.");

    const row = {
      developer_id: dev.id,
      category_id: data.categoryId ?? null,
      name: data.name,
      tagline: data.tagline || null,
      short_description: data.shortDescription || null,
      long_description: data.longDescription || null,
      logo_url: data.logoUrl || null,
      website_url: data.websiteUrl || null,
      documentation_url: data.documentationUrl || null,
      privacy_url: data.privacyUrl || null,
      setup_guide: data.setupGuide || null,
      auth_type: data.authType,
      pricing_type: data.pricingType,
      keywords: data.keywords,
      auth_config: data.authConfig as never,
    };

    let appId = data.appId;
    if (appId) {
      const { data: owned } = await sb.from("apps").select("id, developer_id, status").eq("id", appId).maybeSingle();
      if (!owned || owned.developer_id !== dev.id) throw new Error("App not found.");
      if (owned.status === "published") throw new Error("Unpublish this app before editing it.");
      const { error } = await sb.from("apps").update(row).eq("id", appId);
      if (error) throw new Error(error.message);
    } else {
      let slug = slugify(data.name);
      const { data: clash } = await sb.from("apps").select("id").eq("slug", slug).maybeSingle();
      if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: created, error } = await sb
        .from("apps")
        .insert({ ...row, slug, status: "draft", visibility: "private" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      appId = created.id;
    }

    // Replace declared capabilities.
    await sb.from("app_actions").delete().eq("app_id", appId);
    await sb.from("app_triggers").delete().eq("app_id", appId);
    if (data.actions.length) {
      await sb.from("app_actions").insert(
        data.actions.map((a) => ({
          app_id: appId!,
          name: a.name,
          slug: a.slug || slugify(a.name),
          description: a.description || null,
          canonical_entity: a.entity || null,
        })),
      );
    }
    if (data.triggers.length) {
      await sb.from("app_triggers").insert(
        data.triggers.map((t) => ({
          app_id: appId!,
          name: t.name,
          slug: t.slug || slugify(t.name),
          description: t.description || null,
          canonical_entity: t.entity || null,
        })),
      );
    }
    return { appId };
  });

export const submitAppForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ appId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await db();
    const { data: dev } = await sb.from("developers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!dev) throw new Error("Developer profile missing.");
    const { data: app } = await sb
      .from("apps")
      .select("id, developer_id, name, short_description, category_id, logo_url")
      .eq("id", data.appId)
      .maybeSingle();
    if (!app || app.developer_id !== dev.id) throw new Error("App not found.");
    if (!app.short_description || !app.category_id) {
      throw new Error("Add a category and short description before submitting.");
    }
    const { error } = await sb
      .from("apps")
      .update({ status: "in_review", submitted_at: new Date().toISOString(), review_notes: null })
      .eq("id", app.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Block localhost, private ranges, link-local and cloud metadata hosts (SSRF guard). */
function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  if (host.includes(":")) return false; // IPv6 literals (incl. ::1, fc00::/7) are not allowed
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  return true;
}

/** Sandbox test connection: validates the declared endpoints are reachable. */
export const testAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().url() }).parse(d))
  .handler(async ({ data, context }) => {
    // Only registered developers may use the tester, and only against public
    // internet hosts: without these guards the server could be used to probe
    // internal services (SSRF).
    const sb = await db();
    const { data: dev } = await sb.from("developers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!dev) throw new Error("Create your developer profile first.");

    let url: URL;
    try {
      url = new URL(data.url);
    } catch {
      throw new Error("Enter a valid https:// URL");
    }
    if (url.protocol !== "https:") throw new Error("Only https:// endpoints can be tested");
    if (!isPublicHostname(url.hostname)) throw new Error("Only public internet endpoints can be tested");

    const started = Date.now();
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, ms: Date.now() - started };
    } catch (e) {
      return { ok: false, status: 0, ms: Date.now() - started, error: (e as Error).message };
    }
  });

export const createDeveloperApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(2).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await db();
    const { createHash, randomBytes } = await import("crypto");
    const { data: dev } = await sb.from("developers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!dev) throw new Error("Create your developer profile first.");

    const secret = randomBytes(24).toString("base64url");
    const key = `xv_live_${secret}`;
    const { error } = await sb.from("developer_api_keys").insert({
      developer_id: dev.id,
      name: data.name,
      key_prefix: key.slice(0, 12),
      key_hash: createHash("sha256").update(key).digest("hex"),
    });
    if (error) throw new Error(error.message);
    // Returned exactly once — only the hash is stored.
    return { key };
  });

export const revokeDeveloperApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await db();
    const { data: dev } = await sb.from("developers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!dev) throw new Error("Developer profile missing.");
    const { error } = await sb
      .from("developer_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.keyId)
      .eq("developer_id", dev.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
