import { createHash, createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import type { ApiScope, TenantWebhookEvent } from "./tenant-api.shared";

export type ApiAuth = {
  apiKeyId: string;
  accountId: string;
  scopes: string[];
  requestId: string;
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function apiJson(body: unknown, status = 200, requestId?: string) {
  return Response.json(body, {
    status,
    headers: requestId ? { "x-request-id": requestId } : undefined,
  });
}

export function apiErrorResponse(error: unknown, requestId: string) {
  const known = error instanceof ApiError;
  const status = known ? error.status : 500;
  const code = known ? error.code : "internal_error";
  const message = known ? error.message : "The request could not be completed.";
  return apiJson({ error: { code, message, request_id: requestId } }, status, requestId);
}

export async function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export async function authenticateApiRequest(request: Request, scope: ApiScope): Promise<ApiAuth> {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key.startsWith("xv_api_")) throw new ApiError(401, "invalid_api_key", "Provide a valid workspace API key.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)("authenticate_workspace_api_key", {
    _key_hash: await hashSecret(key),
    _request_id: requestId,
    _method: request.method,
    _path: new URL(request.url).pathname,
  });
  if (error || !data?.[0]) {
    const message = String(error?.message ?? "");
    if (message.includes("rate_limit_exceeded")) throw new ApiError(429, "rate_limit_exceeded", "Too many requests. Try again shortly.");
    if (message.includes("account_suspended")) throw new ApiError(403, "account_suspended", "This workspace cannot send messages.");
    throw new ApiError(401, "invalid_api_key", "The API key is invalid, expired, or revoked.");
  }
  const row = data[0];
  if (!(row.scopes ?? []).includes(scope)) throw new ApiError(403, "insufficient_scope", `This key requires the ${scope} scope.`);
  return { apiKeyId: row.api_key_id, accountId: row.account_id, scopes: row.scopes ?? [], requestId };
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) throw new ApiError(415, "unsupported_media_type", "Send a JSON request body.");
  try { return await request.json(); } catch { throw new ApiError(400, "invalid_json", "The JSON body is invalid."); }
}

export async function assertIdempotency(request: Request, auth: ApiAuth, body: unknown) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new ApiError(400, "idempotency_key_required", "Send a unique Idempotency-Key header.");
  const requestHash = await hashSecret(JSON.stringify(body));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin.from("api_idempotency_records")
    .select("request_hash,response_status,response_body")
    .eq("api_key_id", auth.apiKeyId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, "idempotency_conflict", "That Idempotency-Key was already used with a different request.");
    return { key: idempotencyKey, hash: requestHash, replay: existing.response_body ? { status: existing.response_status ?? 200, body: existing.response_body } : null };
  }
  const { error } = await supabaseAdmin.from("api_idempotency_records").insert({
    account_id: auth.accountId, api_key_id: auth.apiKeyId, idempotency_key: idempotencyKey, request_hash: requestHash,
  });
  if (error) throw new ApiError(409, "request_in_progress", "An identical request is already being processed.");
  return { key: idempotencyKey, hash: requestHash, replay: null };
}

export async function finishIdempotency(auth: ApiAuth, key: string, status: number, body: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("api_idempotency_records").update({ response_status: status, response_body: body as any })
    .eq("api_key_id", auth.apiKeyId).eq("idempotency_key", key);
}

function encryptionKey() {
  const raw = process.env["API_WEBHOOK_ENCRYPTION_KEY"];
  if (!raw) throw new Error("Webhook encryption is unavailable");
  return createHash("sha256").update(raw).digest();
}

export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

function decryptWebhookSecret(value: string) {
  const all = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), all.subarray(0, 12));
  decipher.setAuthTag(all.subarray(12, 28));
  return Buffer.concat([decipher.update(all.subarray(28)), decipher.final()]).toString("utf8");
}

export function makeWebhookSecret() { return `whsec_${randomBytes(32).toString("base64url")}`; }

export function signWebhook(secret: string, timestamp: string, payload: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export async function enqueueTenantWebhook(accountId: string, eventType: TenantWebhookEvent, resourceId: string, data: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: endpoints } = await supabaseAdmin.from("api_webhook_endpoints")
    .select("id").eq("account_id", accountId).eq("active", true).contains("events", [eventType]);
  if (!endpoints?.length) return;
  await supabaseAdmin.from("api_webhook_events").upsert(endpoints.map((endpoint) => ({
    account_id: accountId, endpoint_id: endpoint.id, event_type: eventType, resource_id: resourceId,
    payload: { id: resourceId, type: eventType, created_at: new Date().toISOString(), data },
  })), { onConflict: "endpoint_id,event_type,resource_id", ignoreDuplicates: true });
  void dispatchPendingWebhooks(accountId, 6);
}

export async function dispatchPendingWebhooks(accountId: string, limit = 6) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: events } = await supabaseAdmin.from("api_webhook_events")
    .select("id,endpoint_id,event_type,payload,attempt_count,api_webhook_endpoints!inner(url,secret_ciphertext,active)")
    .eq("account_id", accountId).in("status", ["pending", "retrying"]).lte("available_at", new Date().toISOString())
    .eq("api_webhook_endpoints.active", true).order("created_at").limit(Math.min(limit, 6));
  await Promise.all((events ?? []).map(async (event: any) => {
    const started = Date.now();
    const body = JSON.stringify(event.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let responseStatus: number | null = null, responseBody: string | null = null, errorText: string | null = null;
    try {
      const secret = decryptWebhookSecret(event.api_webhook_endpoints.secret_ciphertext);
      const response = await fetch(event.api_webhook_endpoints.url, { method: "POST", headers: {
        "content-type": "application/json", "x-xellvio-event": event.event_type,
        "x-xellvio-timestamp": timestamp, "x-xellvio-signature": `v1=${signWebhook(secret, timestamp, body)}`,
      }, body, signal: AbortSignal.timeout(10_000) });
      responseStatus = response.status;
      responseBody = (await response.text()).slice(0, 1000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await supabaseAdmin.from("api_webhook_events").update({ status: "delivered", delivered_at: new Date().toISOString(), attempt_count: event.attempt_count + 1, last_error: null }).eq("id", event.id);
      await supabaseAdmin.from("api_webhook_endpoints").update({ last_success_at: new Date().toISOString() }).eq("id", event.endpoint_id);
    } catch (error) {
      errorText = error instanceof Error ? error.message.slice(0, 500) : "Delivery failed";
      const attempts = event.attempt_count + 1;
      const terminal = attempts >= 8;
      await supabaseAdmin.from("api_webhook_events").update({ status: terminal ? "failed" : "retrying", attempt_count: attempts, last_error: errorText, available_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 15) * 1000).toISOString() }).eq("id", event.id);
      await supabaseAdmin.from("api_webhook_endpoints").update({ last_failure_at: new Date().toISOString() }).eq("id", event.endpoint_id);
    }
    await supabaseAdmin.from("api_webhook_delivery_attempts").insert({ account_id: accountId, event_id: event.id, attempt_number: event.attempt_count + 1, response_status: responseStatus, response_body: responseBody, error: errorText, duration_ms: Date.now() - started });
  }));
}
