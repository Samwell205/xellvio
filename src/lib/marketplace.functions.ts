// Tenant-facing marketplace server functions: installs, connections, logs.
// Credentials are encrypted server-side and never returned to the browser.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InstalledApp = {
  installationId: string;
  appId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  categoryName: string | null;
  authType: string;
  status: string;
  installedAt: string;
  connection: {
    id: string;
    name: string | null;
    status: string;
    accountLabel: string | null;
    settings: Record<string, unknown>;
    lastError: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
  } | null;
};

async function ctx(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveActingAccount } = await import("@/lib/acting-account.server");
  const acting = await resolveActingAccount(userId);
  return { db: supabaseAdmin, acting };
}

export const listMyInstallations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstalledApp[]> => {
    const { db, acting } = await ctx(context.userId);
    const { data, error } = await db
      .from("app_installations")
      .select(
        `id, app_id, status, installed_at,
         apps ( slug, name, logo_url, accent_color, auth_type, app_categories ( name ) ),
         app_connections ( id, connection_name, status, external_account_label, settings, last_error, last_synced_at, created_at )`,
      )
      .eq("workspace_id", acting.accountId)
      .neq("status", "uninstalled")
      .order("installed_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => {
      const conn = (row.app_connections ?? [])[0] ?? null;
      return {
        installationId: row.id,
        appId: row.app_id,
        slug: row.apps?.slug ?? "",
        name: row.apps?.name ?? "App",
        logoUrl: row.apps?.logo_url ?? null,
        accentColor: row.apps?.accent_color ?? null,
        categoryName: row.apps?.app_categories?.name ?? null,
        authType: row.apps?.auth_type ?? "custom",
        status: row.status,
        installedAt: row.installed_at,
        connection: conn
          ? {
              id: conn.id,
              name: conn.connection_name,
              status: conn.status,
              accountLabel: conn.external_account_label,
              settings: conn.settings ?? {},
              lastError: conn.last_error,
              lastSyncedAt: conn.last_synced_at,
              createdAt: conn.created_at,
            }
          : null,
      };
    });
  });

const connectSchema = z.object({
  appId: z.string().uuid(),
  connectionName: z.string().trim().max(120).optional(),
  accountLabel: z.string().trim().max(160).optional(),
  /** Provider credentials (api key / token / oauth client details). Never stored in plain text. */
  credentials: z.record(z.string(), z.string().max(4000)).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  scopes: z.array(z.string().max(120)).max(50).default([]),
});

/**
 * Installs the app for the acting workspace (if needed) and stores an encrypted
 * connection. For OAuth 2.0 apps this is the final step of the handshake; the
 * tokens arrive here and are encrypted before they touch the database.
 */
export const connectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => connectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { db, acting } = await ctx(context.userId);
    if (!acting.isOwner && acting.role !== "admin") {
      throw new Error("Only workspace owners and admins can connect apps.");
    }
    const { encryptToken } = await import("@/lib/tenant-crypto.server");

    const { data: app, error: appErr } = await db
      .from("apps")
      .select("id, name, slug, status, visibility")
      .eq("id", data.appId)
      .maybeSingle();
    if (appErr) throw new Error(appErr.message);
    if (!app || app.status !== "published") throw new Error("This app is not available.");

    const { data: install, error: insErr } = await db
      .from("app_installations")
      .upsert(
        {
          app_id: app.id,
          workspace_id: acting.accountId,
          user_id: context.userId,
          status: "installed",
          uninstalled_at: null,
        },
        { onConflict: "app_id,workspace_id" },
      )
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const hasCreds = Object.keys(data.credentials).length > 0;
    const encrypted = hasCreds ? encryptToken(JSON.stringify(data.credentials)) : null;

    const { data: existing } = await db
      .from("app_connections")
      .select("id")
      .eq("installation_id", install.id)
      .maybeSingle();

    const payload = {
      installation_id: install.id,
      connection_name: data.connectionName ?? app.name,
      external_account_label: data.accountLabel ?? null,
      scopes: data.scopes,
      settings: data.settings as never,
      status: "connected",
      last_error: null,
      last_synced_at: new Date().toISOString(),
      ...(encrypted ? { credentials_encrypted: encrypted } : {}),
    };

    let connectionId: string;
    if (existing) {
      const { error } = await db.from("app_connections").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      connectionId = existing.id;
    } else {
      const { data: created, error } = await db
        .from("app_connections")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      connectionId = created.id;
    }

    await db.rpc as unknown; // no-op keeps types happy for optional rpc use
    await db
      .from("apps")
      .update({ install_count: await nextInstallCount(db, app.id) })
      .eq("id", app.id);

    await db.from("integration_logs").insert({
      app_id: app.id,
      connection_id: connectionId,
      workspace_id: acting.accountId,
      event_type: "connection",
      action: existing ? "reconnected" : "connected",
      status: "ok",
      request_data: { fields: Object.keys(data.credentials) } as never,
    });

    return { installationId: install.id, connectionId, appName: app.name };
  });

async function nextInstallCount(db: any, appId: string): Promise<number> {
  const { count } = await db
    .from("app_installations")
    .select("id", { count: "exact", head: true })
    .eq("app_id", appId)
    .eq("status", "installed");
  const { data } = await db.from("apps").select("install_count").eq("id", appId).maybeSingle();
  const base = data?.install_count ?? 0;
  return Math.max(base, count ?? 0);
}

export const updateConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        connectionId: z.string().uuid(),
        connectionName: z.string().trim().max(120).optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, acting } = await ctx(context.userId);
    const { data: conn } = await db
      .from("app_connections")
      .select("id, app_installations!inner ( workspace_id )")
      .eq("id", data.connectionId)
      .maybeSingle();
    const wsId = (conn as any)?.app_installations?.workspace_id;
    if (!conn || wsId !== acting.accountId) throw new Error("Connection not found.");

    const { error } = await db
      .from("app_connections")
      .update({
        ...(data.connectionName !== undefined ? { connection_name: data.connectionName } : {}),
        ...(data.settings !== undefined ? { settings: data.settings as never } : {}),
      })
      .eq("id", data.connectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ installationId: z.string().uuid(), uninstall: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, acting } = await ctx(context.userId);
    if (!acting.isOwner && acting.role !== "admin") {
      throw new Error("Only workspace owners and admins can disconnect apps.");
    }
    const { data: install } = await db
      .from("app_installations")
      .select("id, app_id, workspace_id")
      .eq("id", data.installationId)
      .maybeSingle();
    if (!install || install.workspace_id !== acting.accountId) throw new Error("App not found.");

    await db.from("app_connections").delete().eq("installation_id", install.id);
    if (data.uninstall) {
      await db
        .from("app_installations")
        .update({ status: "uninstalled", uninstalled_at: new Date().toISOString() })
        .eq("id", install.id);
    }
    await db.from("integration_logs").insert({
      app_id: install.app_id,
      workspace_id: acting.accountId,
      event_type: "connection",
      action: data.uninstall ? "uninstalled" : "disconnected",
      status: "ok",
    });
    return { ok: true };
  });

export const listIntegrationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, acting } = await ctx(context.userId);
    const { data } = await db
      .from("integration_logs")
      .select("id, event_type, action, status, error_message, created_at, apps ( name, slug )")
      .eq("workspace_id", acting.accountId)
      .order("created_at", { ascending: false })
      .limit(60);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      eventType: r.event_type,
      action: r.action,
      status: r.status,
      error: r.error_message,
      createdAt: r.created_at,
      appName: r.apps?.name ?? null,
      appSlug: r.apps?.slug ?? null,
    }));
  });

/**
 * Recommendation engine: looks at what the workspace actually uses
 * (landing pages, sign-up forms, products, bookings, campaign volume) and
 * suggests the integrations that fit that business shape.
 */
export const recommendedApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, acting } = await ctx(context.userId);
    const ws = acting.accountId;
    const [pages, forms, campaigns, installs] = await Promise.all([
      db.from("landing_pages").select("id, blocks", { count: "exact" }).eq("account_id", ws).limit(20),
      db.from("signup_forms").select("id", { count: "exact", head: true }).eq("account_id", ws),
      db.from("campaigns").select("id", { count: "exact", head: true }).eq("account_id", ws),
      db.from("app_installations").select("app_id").eq("workspace_id", ws).eq("status", "installed"),
    ]);

    const pageText = JSON.stringify(pages.data ?? []).toLowerCase();
    const ecommerce = /product|shop|store|cart|checkout|price/.test(pageText);
    const booking = /book|appointment|schedule|calendar|consult/.test(pageText);
    const wanted: { slug: string; reason: string }[] = [];

    if (ecommerce) {
      wanted.push(
        { slug: "shopify", reason: "Your pages sell products — sync catalogue, customers and orders." },
        { slug: "stripe", reason: "Track payments and trigger receipts or win-back messages." },
        { slug: "klaviyo", reason: "Keep email and SMS audiences aligned across both platforms." },
        { slug: "google-analytics", reason: "Attribute store revenue back to your SMS campaigns." },
        { slug: "meta-pixel", reason: "Feed purchases back to Meta for better ad targeting." },
      );
    }
    if (booking || !ecommerce) {
      wanted.push(
        { slug: "gohighlevel", reason: "Manage service leads and pipelines from one place." },
        { slug: "hubspot", reason: "Keep your CRM in sync with every form submission." },
        { slug: "calendly", reason: "Turn SMS conversations into booked appointments." },
        { slug: "stripe", reason: "Collect deposits and payments for booked work." },
      );
    }
    if ((forms.count ?? 0) > 0) {
      wanted.push({ slug: "zapier", reason: "Route form submissions anywhere with no code." });
    }
    if ((campaigns.count ?? 0) > 5) {
      wanted.push({ slug: "slack", reason: "Get campaign results and replies in your team channel." });
    }
    wanted.push({ slug: "openai", reason: "Draft SMS copy and landing page content faster." });

    const installedIds = new Set((installs.data ?? []).map((r: any) => r.app_id));
    const slugs = [...new Set(wanted.map((w) => w.slug))].slice(0, 8);
    const { data: apps } = await db
      .from("apps")
      .select("id, name, slug, tagline, short_description, logo_url, accent_color, install_count, rating, app_categories ( name )")
      .in("slug", slugs)
      .eq("status", "published");

    return (apps ?? [])
      .filter((a: any) => !installedIds.has(a.id))
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        tagline: a.tagline,
        shortDescription: a.short_description,
        logoUrl: a.logo_url,
        accentColor: a.accent_color,
        categoryName: a.app_categories?.name ?? null,
        installCount: a.install_count,
        rating: a.rating,
        reason: wanted.find((w) => w.slug === a.slug)?.reason ?? "",
      }));
  });
