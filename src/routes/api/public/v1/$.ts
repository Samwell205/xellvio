import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sendBulkSchema, sendMessageSchema, safeFailureReason } from "@/lib/tenant-api.shared";
import { ApiError, apiErrorResponse, apiJson, assertIdempotency, authenticateApiRequest, finishIdempotency, readJson } from "@/lib/tenant-api.server";

function parts(request: Request) { return new URL(request.url).pathname.replace(/^\/api\/public\/v1\/?/, "").split("/").filter(Boolean); }
function cursorDate(value: string | null) { if (!value) return null; const parsed = new Date(Buffer.from(value, "base64url").toString("utf8")); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function nextCursor(rows: Array<{ created_at: string }>) { const last = rows.at(-1); return last ? Buffer.from(last.created_at).toString("base64url") : null; }

async function validateSender(accountId: string, sender?: string) {
  if (!sender) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("sender_assets").select("id").eq("account_id", accountId).eq("verification_status", "verified").or(`phone_number.eq.${sender},sender_id.eq.${sender}`).limit(1).maybeSingle();
  if (!data) throw new ApiError(422, "sender_not_available", "The requested sender is not verified for this workspace.");
}

async function queueBatch(request: Request, single: boolean) {
  const auth = await authenticateApiRequest(request, "messages:send"); const raw = await readJson(request);
  const parsed = single ? sendMessageSchema.parse(raw) : sendBulkSchema.parse(raw);
  const recipients = single ? [{ phone: (parsed as z.infer<typeof sendMessageSchema>).to, consent_confirmed: true }] : (parsed as z.infer<typeof sendBulkSchema>).recipients;
  const body = parsed.body; const sender = parsed.sender; await validateSender(auth.accountId, sender);
  const { screenMessageContent } = await import("@/lib/content-screening.server");
  const screened = await screenMessageContent(body, auth.accountId, { context: "campaign", plannedRecipients: recipients.length, skipReviewQueue: true });
  if (!screened.passed) throw new ApiError(422, "content_blocked", `Message content was blocked: ${screened.blockedReasons.slice(0, 2).join("; ")}`);
  const idem = await assertIdempotency(request, auth, parsed); if (idem.replay) return apiJson(idem.replay.body, idem.replay.status, auth.requestId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)("create_api_sms_batch", { _account_id: auth.accountId, _api_key_id: auth.apiKeyId, _name: single ? "API message" : (parsed as z.infer<typeof sendBulkSchema>).name, _body: body, _recipients: recipients, _metadata: parsed.metadata ?? {} });
  if (error || !data?.[0]) {
    await supabaseAdmin.from("api_idempotency_records").delete().eq("api_key_id", auth.apiKeyId).eq("idempotency_key", idem.key).is("response_body", null);
    const message = String(error?.message ?? ""); if (message.includes("opted out")) throw new ApiError(422, "recipient_suppressed", "One or more recipients opted out."); throw new ApiError(422, "request_rejected", message || "The batch could not be queued.");
  }
  const row = data[0]; const response = single ? { id: row.batch_id, batch_id: row.batch_id, status: "queued", recipient: recipients[0].phone } : { id: row.batch_id, status: "queued", recipient_count: row.accepted_count };
  await finishIdempotency(auth, idem.key, 202, response); return apiJson(response, 202, auth.requestId);
}

async function getHandler(request: Request) {
  const p = parts(request); const url = new URL(request.url);
  if (p[0] === "senders") { const auth = await authenticateApiRequest(request, "messages:read"); const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const { data } = await supabaseAdmin.from("sender_assets").select("id,sender_kind,phone_number,sender_id,country_code,verified_at").eq("account_id", auth.accountId).eq("verification_status", "verified"); return apiJson({ data: data ?? [] }, 200, auth.requestId); }
  if (p[0] === "replies") { const auth = await authenticateApiRequest(request, "replies:read"); const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 200); const cursor = cursorDate(url.searchParams.get("cursor")); const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); let q = supabaseAdmin.from("sms_thread_messages").select("id,phone_e164,body,from_number,to_number,status,created_at").eq("account_id", auth.accountId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(limit); if (cursor) q = q.lt("created_at", cursor); const { data } = await q; return apiJson({ data: data ?? [], next_cursor: nextCursor(data ?? []) }, 200, auth.requestId); }
  if (p[0] === "suppressions" && p[1]) { const auth = await authenticateApiRequest(request, "messages:read"); const phone = decodeURIComponent(p[1]); if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) throw new ApiError(400, "invalid_phone", "Use E.164 format."); const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const { data } = await supabaseAdmin.from("suppressions").select("reason,source,created_at").eq("account_id", auth.accountId).eq("phone_e164", phone).maybeSingle(); return apiJson({ phone, suppressed: Boolean(data), details: data ?? null }, 200, auth.requestId); }
  if ((p[0] === "batches" || p[0] === "messages") && p[1]) { const auth = await authenticateApiRequest(request, "messages:read"); const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const { data: batch } = await supabaseAdmin.from("api_batches").select("id,campaign_id,recipient_count,accepted_count,rejected_count,metadata,created_at").eq("id", p[1]).eq("account_id", auth.accountId).maybeSingle(); if (!batch) throw new ApiError(404, "not_found", "Message or batch not found."); const { data: rows } = await supabaseAdmin.from("messages").select("id,phone_e164,status,error_code,failure_reason,cost,sent_at,delivered_at,created_at").eq("campaign_id", batch.campaign_id).order("created_at").limit(1000); const messages = (rows ?? []).map((m) => ({ ...m, failure_reason: safeFailureReason(m.failure_reason) })); const totals = messages.reduce((a: Record<string, number>, m) => ({ ...a, [m.status]: (a[m.status] ?? 0) + 1 }), {}); return apiJson({ id: batch.id, status: messages.length && messages.every((m) => ["delivered","delivery_unconfirmed","failed","undelivered"].includes(m.status)) ? "completed" : "processing", recipient_count: batch.recipient_count, totals, messages }, 200, auth.requestId); }
  throw new ApiError(404, "not_found", "API endpoint not found.");
}

export const Route = createFileRoute("/api/public/v1/$")({ server: { handlers: {
  OPTIONS: async () => new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "Authorization,Content-Type,Idempotency-Key,X-Request-Id" } }),
  GET: async ({ request }) => { const requestId = request.headers.get("x-request-id")?.slice(0,100) || crypto.randomUUID(); try { return await getHandler(request); } catch (e) { return apiErrorResponse(e, requestId); } },
  POST: async ({ request }) => { const requestId = request.headers.get("x-request-id")?.slice(0,100) || crypto.randomUUID(); try { const p = parts(request); if (p.length === 1 && p[0] === "messages") return await queueBatch(request, true); if (p.length === 2 && p[0] === "messages" && p[1] === "bulk") return await queueBatch(request, false); throw new ApiError(404, "not_found", "API endpoint not found."); } catch (e) { if (e instanceof z.ZodError) return apiErrorResponse(new ApiError(422, "validation_error", e.issues.map((x) => x.message).join("; ")), requestId); return apiErrorResponse(e, requestId); } },
} } });
