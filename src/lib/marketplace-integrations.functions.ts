// ============================================================================
// Live integration actions for connected marketplace apps: test a connection,
// pull records in, send messages out, and manage workspace-to-workspace keys.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ctx(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveActingAccount } = await import("@/lib/acting-account.server");
  const acting = await resolveActingAccount(userId);
  return { db: supabaseAdmin as any, acting };
}

type Loaded = {
  db: any;
  accountId: string;
  installationId: string;
  connectionId: string;
  appId: string;
  slug: string;
  appName: string;
  settings: Record<string, unknown>;
  credentials: Record<string, string>;
};

async function loadConnection(userId: string, installationId: string): Promise<Loaded> {
  const { db, acting } = await ctx(userId);
  const { data: install } = await db
    .from("app_installations")
    .select("id, app_id, workspace_id, apps ( slug, name ), app_connections ( id, settings, credentials_encrypted )")
    .eq("id", installationId)
    .maybeSingle();
  if (!install || install.workspace_id !== acting.accountId) throw new Error("App not found in this workspace.");
  const conn = (install.app_connections ?? [])[0];
  if (!conn) throw new Error("This app is not connected yet.");

  let credentials: Record<string, string> = {};
  if (conn.credentials_encrypted) {
    const { decryptToken } = await import("@/lib/tenant-crypto.server");
    try {
      credentials = JSON.parse(decryptToken(conn.credentials_encrypted));
    } catch {
      throw new Error("Stored credentials could not be read. Reconnect the app.");
    }
  }
  return {
    db,
    accountId: acting.accountId,
    installationId: install.id,
    connectionId: conn.id,
    appId: install.app_id,
    slug: install.apps?.slug ?? "",
    appName: install.apps?.name ?? "App",
    settings: (conn.settings ?? {}) as Record<string, unknown>,
    credentials,
  };
}

const idInput = (d: unknown) => z.object({ installationId: z.string().uuid() }).parse(d);

/** Re-checks stored credentials against the provider. */
export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.userId, data.installationId);
    const { runtimeFor } = await import("@/lib/marketplace/providers.server");
    const runtime = runtimeFor(c.slug);
    if (!runtime?.verify) return { ok: true, message: `${c.appName} stores credentials only — nothing to test.` };
    try {
      const res = await runtime.verify(c.credentials, { db: c.db, accountId: c.accountId, settings: c.settings });
      await c.db
        .from("app_connections")
        .update({ status: "connected", last_error: null, external_account_label: res.accountLabel ?? null })
        .eq("id", c.connectionId);
      await c.db.from("integration_logs").insert({
        app_id: c.appId,
        connection_id: c.connectionId,
        workspace_id: c.accountId,
        event_type: "connection",
        action: "tested",
        status: "ok",
      });
      return { ok: true, message: res.note ?? `${c.appName} connection is working.`, accountLabel: res.accountLabel ?? null };
    } catch (e: any) {
      const message = String(e?.message ?? e).slice(0, 500);
      await c.db.from("app_connections").update({ status: "error", last_error: message }).eq("id", c.connectionId);
      await c.db.from("integration_logs").insert({
        app_id: c.appId,
        connection_id: c.connectionId,
        workspace_id: c.accountId,
        event_type: "connection",
        action: "tested",
        status: "error",
        error_message: message,
      });
      throw new Error(message);
    }
  });

/** Pulls the provider's people/customers into this workspace's contacts. */
export const syncConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.userId, data.installationId);
    const { runtimeFor } = await import("@/lib/marketplace/providers.server");
    const runtime = runtimeFor(c.slug);
    if (!runtime?.sync) throw new Error(`${c.appName} does not support importing contacts yet.`);
    if (c.settings["sync_contacts"] === false) throw new Error("Contact syncing is switched off for this connection.");
    try {
      const res = await runtime.sync(c.credentials, { db: c.db, accountId: c.accountId, settings: c.settings });
      await c.db
        .from("app_connections")
        .update({ last_synced_at: new Date().toISOString(), status: "connected", last_error: null })
        .eq("id", c.connectionId);
      await c.db.from("integration_logs").insert({
        app_id: c.appId,
        connection_id: c.connectionId,
        workspace_id: c.accountId,
        event_type: "sync",
        action: "import_contacts",
        status: "ok",
        response_data: res as never,
      });
      return res;
    } catch (e: any) {
      const message = String(e?.message ?? e).slice(0, 500);
      await c.db.from("app_connections").update({ status: "error", last_error: message }).eq("id", c.connectionId);
      await c.db.from("integration_logs").insert({
        app_id: c.appId,
        connection_id: c.connectionId,
        workspace_id: c.accountId,
        event_type: "sync",
        action: "import_contacts",
        status: "error",
        error_message: message,
      });
      throw new Error(message);
    }
  });

/** Verified sending numbers available to bind to the Xellvio SMS app. */
export const listSenderOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, acting } = await ctx(context.userId);
    const { data } = await db
      .from("sender_assets")
      .select("phone_number, sender_kind, country_code, verification_status")
      .eq("account_id", acting.accountId)
      .eq("verification_status", "verified");
    return (data ?? [])
      .filter((a: any) => !!a.phone_number)
      .map((a: any) => ({
        phone: a.phone_number as string,
        kind: (a.sender_kind ?? "number") as string,
        country: (a.country_code ?? "") as string,
      }));
  });

/** Sends a message through a connected app (Xellvio SMS, Slack, webhooks…). */
export const sendViaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        installationId: z.string().uuid(),
        to: z.string().trim().max(24).optional(),
        text: z.string().trim().min(1).max(1600),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.userId, data.installationId);
    const { runtimeFor } = await import("@/lib/marketplace/providers.server");
    const runtime = runtimeFor(c.slug);
    if (!runtime?.send) throw new Error(`${c.appName} cannot send messages.`);

    // Real SMS goes through the same compliance + billing path as the inbox.
    if (c.slug === "xellvio-sms") {
      if (!data.to) throw new Error("Enter the number to text.");
      const { normalizePhone } = await import("@/lib/phone-normalize");
      const norm = normalizePhone(data.to, { defaultCountry: "US" });
      if ("error" in norm) throw new Error(norm.error);

      const { data: acct } = await c.db
        .from("accounts")
        .select("credit_balance, sending_suspended_at")
        .eq("id", c.accountId)
        .maybeSingle();
      if (acct?.sending_suspended_at) throw new Error("Sending is suspended on this workspace.");

      const { calculateSegments } = await import("@/lib/sms-segments");
      const { data: rates } = await c.db
        .from("country_rates")
        .select("country_code, sell_price, active")
        .eq("active", true);
      const rate = (rates ?? []).find((r: any) => r.country_code === norm.country);
      const segs = calculateSegments(data.text).segments || 1;
      const cost = +(segs * Number(rate?.sell_price ?? 0)).toFixed(4);
      const balance = Number(acct?.credit_balance ?? 0);
      if (cost > 0 && balance < cost) throw new Error("Not enough credit to send this message. Please top up.");

      const { screenMessageContent } = await import("@/lib/content-screening.server");
      const screen = await screenMessageContent(data.text, c.accountId, {
        phoneE164: norm.e164,
        context: "inbox_reply",
        skipReviewQueue: true,
      });
      if (!screen.passed) {
        throw new Error(
          `Message blocked by compliance screening (${screen.blockedReasons.slice(0, 2).join(" · ") || "content policy"}).`,
        );
      }

      await runtime.send(c.credentials, { db: c.db, accountId: c.accountId, settings: c.settings }, {
        text: data.text,
        to: norm.e164,
      });

      await c.db.from("sms_thread_messages").insert({
        account_id: c.accountId,
        phone_e164: norm.e164,
        direction: "outbound",
        body: data.text,
        from_number: String(c.settings["sender_number"] ?? "") || null,
        to_number: norm.e164,
        status: "sent",
      });
      if (cost > 0) {
        try {
          await c.db.rpc("debit_account", {
            _account_id: c.accountId,
            _amount: cost,
            _campaign_id: null,
            _description: `App SMS → ${norm.e164} (${norm.country}) × ${segs}`,
          });
        } catch {
          /* balance was verified above */
        }
      }
    } else {
      await runtime.send(c.credentials, { db: c.db, accountId: c.accountId, settings: c.settings }, {
        text: data.text,
        to: data.to,
      });
    }

    await c.db.from("integration_logs").insert({
      app_id: c.appId,
      connection_id: c.connectionId,
      workspace_id: c.accountId,
      event_type: "action",
      action: "send_message",
      status: "ok",
    });
    return { ok: true, message: "Message sent." };
  });

// ── Workspace-to-workspace keys (Xellvio Connect) ───────────────────────────

export const listWorkspaceKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, acting } = await ctx(context.userId);
    const { data } = await db
      .from("workspace_api_keys")
      .select("id, name, key_prefix, last_used_at, revoked_at, created_at")
      .eq("account_id", acting.accountId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((k: any) => ({
      id: k.id as string,
      name: k.name as string,
      prefix: k.key_prefix as string,
      lastUsedAt: k.last_used_at as string | null,
      revokedAt: k.revoked_at as string | null,
      createdAt: k.created_at as string,
    }));
  });

export const createWorkspaceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80).default("Workspace key") }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, acting } = await ctx(context.userId);
    if (!acting.isOwner && acting.role !== "admin") {
      throw new Error("Only workspace owners and admins can create workspace keys.");
    }
    const { hashWorkspaceKey } = await import("@/lib/marketplace/providers.server");
    const secret = `xvw_live_${randomBytes(24).toString("hex")}`;
    const { error } = await db.from("workspace_api_keys").insert({
      account_id: acting.accountId,
      name: data.name,
      key_prefix: secret.slice(0, 16),
      key_hash: hashWorkspaceKey(secret),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    // Shown once — it is never retrievable again.
    return { key: secret };
  });

export const revokeWorkspaceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, acting } = await ctx(context.userId);
    if (!acting.isOwner && acting.role !== "admin") {
      throw new Error("Only workspace owners and admins can revoke workspace keys.");
    }
    const { error } = await db
      .from("workspace_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("account_id", acting.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
