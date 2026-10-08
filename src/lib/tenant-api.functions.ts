import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActingAccount } from "./acting-account.server";
import { API_SCOPES, WEBHOOK_EVENTS } from "./tenant-api.shared";

async function adminContext(userId: string) {
  const acting = await resolveActingAccount(userId);
  if (!acting.isOwner && acting.role !== "admin") throw new Error("Only workspace owners and admins can manage API access.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { acting, db: supabaseAdmin };
}

async function latestRequest(db: any, accountId: string) {
  const { data } = await db.from("api_access_requests").select("id,status,company_name,website,use_case,reason,expected_monthly_volume,admin_note,created_at,reviewed_at").eq("account_id", accountId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as null | { id: string; status: string; company_name: string; website: string | null; use_case: string; reason: string; expected_monthly_volume: number | null; admin_note: string | null; created_at: string; reviewed_at: string | null };
}

async function approvedContext(userId: string) {
  const ctx = await adminContext(userId);
  const req = await latestRequest(ctx.db, ctx.acting.accountId);
  if (req?.status !== "approved") throw new Error("API access has not been approved for this workspace yet.");
  return ctx;
}

export const getApiAccessStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { acting, db } = await adminContext(context.userId);
  return { request: await latestRequest(db, acting.accountId) };
});

export const requestApiAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    companyName: z.string().trim().min(2).max(120),
    website: z.string().trim().max(300).optional().or(z.literal("")),
    useCase: z.string().trim().min(10).max(1000),
    reason: z.string().trim().min(10).max(1000),
    expectedMonthlyVolume: z.number().int().min(0).max(100_000_000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { acting, db } = await adminContext(context.userId);
    const current = await latestRequest(db, acting.accountId);
    if (current && (current.status === "pending" || current.status === "approved")) throw new Error(current.status === "pending" ? "Your request is already under review." : "API access is already approved.");
    const { error } = await db.from("api_access_requests").insert({ account_id: acting.accountId, requested_by: context.userId, company_name: data.companyName, website: data.website || null, use_case: data.useCase, reason: data.reason, expected_monthly_volume: data.expectedMonthlyVolume ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTenantApiSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { acting, db } = await approvedContext(context.userId);
  const [{ data: keys }, { data: endpoints }, { data: events }] = await Promise.all([
    db.from("workspace_api_keys").select("id,name,key_prefix,scopes,rate_limit_per_minute,last_used_at,revoked_at,expires_at,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }),
    db.from("api_webhook_endpoints").select("id,name,url,events,active,last_success_at,last_failure_at,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }),
    db.from("api_webhook_events").select("id,event_type,status,attempt_count,last_error,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(30),
  ]);
  return { keys: keys ?? [], endpoints: endpoints ?? [], events: events ?? [], baseUrl: "https://xellvio.com/api/public/v1" };
});

export const createTenantApiKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(API_SCOPES)).min(1), rateLimit: z.number().int().min(1).max(1000).default(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { acting, db } = await approvedContext(context.userId);
    const secret = `xv_api_${randomBytes(32).toString("base64url")}`;
    const { hashSecret } = await import("./tenant-api.server");
    const { error } = await db.from("workspace_api_keys").insert({ account_id: acting.accountId, name: data.name, key_prefix: secret.slice(0, 18), key_hash: await hashSecret(secret), scopes: data.scopes, rate_limit_per_minute: data.rateLimit, created_by: context.userId });
    if (error) throw new Error(error.message);
    return { key: secret };
  });

export const revokeTenantApiKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => { const { acting, db } = await approvedContext(context.userId); const { error } = await db.from("workspace_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", data.id).eq("account_id", acting.accountId); if (error) throw new Error(error.message); return { ok: true }; });

export const createTenantWebhook = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(2).max(80), url: z.string().url().startsWith("https://").max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const url = new URL(data.url);
    if (["localhost", "127.0.0.1"].includes(url.hostname) || url.hostname.endsWith(".local")) throw new Error("Use a public HTTPS endpoint.");
    const { acting, db } = await approvedContext(context.userId);
    const { makeWebhookSecret, encryptWebhookSecret } = await import("./tenant-api.server");
    const secret = makeWebhookSecret();
    const { error } = await db.from("api_webhook_endpoints").insert({ account_id: acting.accountId, name: data.name, url: data.url, events: data.events, secret_ciphertext: encryptWebhookSecret(secret), created_by: context.userId });
    if (error) throw new Error(error.message);
    return { secret };
  });

export const updateTenantWebhook = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), active: z.boolean().optional(), rotateSecret: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { acting, db } = await approvedContext(context.userId);
    const patch: { updated_at: string; active?: boolean; secret_ciphertext?: string } = { updated_at: new Date().toISOString() }; let secret: string | undefined;
    if (data.active !== undefined) patch.active = data.active;
    if (data.rotateSecret) { const api = await import("./tenant-api.server"); secret = api.makeWebhookSecret(); patch.secret_ciphertext = api.encryptWebhookSecret(secret); }
    const { error } = await db.from("api_webhook_endpoints").update(patch).eq("id", data.id).eq("account_id", acting.accountId); if (error) throw new Error(error.message);
    return { ok: true, secret };
  });
