import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { receptionistConfigSchema, canActivateReceptionist, appointmentInputSchema } from "./receptionist/shared";

async function workspace(userId: string, ownerOnly = false, allowComingSoon = false) {
  const { resolveActingAccount, assertPermission, assertOwner } = await import("./acting-account.server");
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "settings");
  if (ownerOnly) assertOwner(acting);
  if (!allowComingSoon) {
    const { assertVoicePilotAccess } = await import("./voice-rollout.server");
    await assertVoicePilotAccess(userId, acting.accountId);
  }
  return acting;
}
export const getReceptionist = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const acting = await workspace(context.userId, false, true);
  const { hasVoicePilotAccess } = await import("./voice-rollout.server");
  if (!await hasVoicePilotAccess(context.userId, acting.accountId)) return {
    available: false, config: receptionistConfigSchema.parse({}), enabled: false, number: null,
    provisionStatus: "not_configured", testVerified: false, pricingApproved: false, numberType: null, numberCountry: null,
    regulatoryNotes: null, billingStatus: "current", renewsAt: null, perMinuteUsd: 0.15, numberMonthlyUsd: 5,
    hasAgent: false, isOwner: acting.isOwner, calendarConnected: false, reconnectRequired: false, calls: [], leads: [], appointments: [],
  };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results = await Promise.all([
    supabaseAdmin.from("receptionist_settings").select("configuration,enabled,voice_number,provision_status,test_verified_at,number_type,number_country,assistant_id,regulatory_notes,number_billing_status,number_renews_at").eq("account_id", acting.accountId).maybeSingle(),
    supabaseAdmin.from("receptionist_calls").select("id,from_number,to_number,status,started_at,ended_at,summary,duration_seconds,cost_amount,cost_status").eq("account_id", acting.accountId).order("started_at", { ascending: false }).limit(50),
    supabaseAdmin.from("receptionist_leads").select("id,name,phone_e164,email,request,sms_consent,consent_evidence,status,created_at").eq("account_id", acting.accountId).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("receptionist_appointments").select("id,name,phone_e164,starts_at,ends_at,status,error").eq("account_id", acting.accountId).order("starts_at", { ascending: false }).limit(50),
    supabaseAdmin.from("receptionist_platform_settings").select("configuration").eq("id", true).maybeSingle(),
    supabaseAdmin.from("app_user_connections").select("reconnect_required").eq("user_id", acting.accountId).eq("connector_id", "google_calendar").maybeSingle(),
  ]);
  for (const result of results) if (result.error) throw new Error("Receptionist records could not be loaded.");
  const [settings,calls,leads,appointments,platform,connection] = results;
  const p = (platform.data?.configuration ?? {}) as Record<string,unknown>;
  return { available: true, config: receptionistConfigSchema.parse(settings.data?.configuration ?? {}), enabled: settings.data?.enabled ?? false, number: settings.data?.voice_number ?? null, provisionStatus: settings.data?.provision_status ?? "not_configured", testVerified: Boolean(settings.data?.test_verified_at), pricingApproved: p.pricingApproved === true, numberType: settings.data?.number_type ?? null, numberCountry: settings.data?.number_country ?? (settings.data?.voice_number?.startsWith("+44") ? "GB" : settings.data?.voice_number?.startsWith("+1") ? "US" : null), regulatoryNotes: settings.data?.regulatory_notes ?? null, billingStatus: settings.data?.number_billing_status ?? "current", renewsAt: settings.data?.number_renews_at ?? null, perMinuteUsd: Number(p.perMinuteUsd ?? 0.15), numberMonthlyUsd: Number(p.numberMonthlyUsd ?? 5), hasAgent: Boolean(settings.data?.assistant_id), isOwner: acting.isOwner, calendarConnected: Boolean(connection.data) && !connection.data?.reconnect_required, reconnectRequired: connection.data?.reconnect_required ?? false, calls: calls.data ?? [], leads: leads.data ?? [], appointments: appointments.data ?? [] };
});
export const saveReceptionist = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => receptionistConfigSchema.parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: current, error: readError } = await supabaseAdmin.from("receptionist_settings").select("enabled").eq("account_id", acting.accountId).maybeSingle();
  if (readError) throw readError;
  if (current?.enabled) throw new Error("Pause your receptionist before changing its business instructions.");
  const { error } = await supabaseAdmin.from("receptionist_settings").upsert({ account_id: acting.accountId, configuration: data, test_verified_at: null, updated_at: new Date().toISOString() });
  if (error) throw new Error("Your settings could not be saved.");
  return { ok: true };
});
export const setReceptionistEnabled = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (data.enabled) {
    const { data: settings } = await supabaseAdmin.from("receptionist_settings").select("*").eq("account_id", acting.accountId).maybeSingle();
    const { data: platform } = await supabaseAdmin.from("receptionist_platform_settings").select("configuration").eq("id", true).maybeSingle();
    const p = (platform?.configuration ?? {}) as Record<string,unknown>, c = receptionistConfigSchema.parse(settings?.configuration ?? {});
    if (!canActivateReceptionist({ pricingApproved: p.pricingApproved === true, voiceVerified: settings?.provision_status === "verified", numberAssigned: Boolean(settings?.voice_number && settings.assistant_id && settings.voice_application_id), testVerified: Boolean(settings?.test_verified_at), businessReady: Boolean(c.businessName && c.businessInformation && c.greeting) })) throw new Error("Calling cannot be enabled until pricing, your phone line, and a pilot call are verified.");
    const { data: account } = await supabaseAdmin.from("accounts").select("sending_suspended_at,suspended_at,onboarding_status").eq("id", acting.accountId).single();
    if (!account || account.suspended_at || account.onboarding_status === "suspended" || account.sending_suspended_at) throw new Error("This business is not eligible for calling.");
  }
  const { data: row, error } = await supabaseAdmin.from("receptionist_settings").update({ enabled: data.enabled, updated_at: new Date().toISOString() }).eq("account_id", acting.accountId).select("account_id").maybeSingle();
  if (error || !row) throw new Error("Save your receptionist setup first.");
  return { ok: true };
});
export const startReceptionistCalendar = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const acting = await workspace(context.userId, true);
  const clientAPIKey = process.env['GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY'];
  if (!clientAPIKey) throw new Error("Google Calendar setup is not available yet.");
  const request = getRequest(), url = new URL(request.url);
  const forwardedHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  const origin = forwardedHost ? `https://${forwardedHost}` : url.origin;
  const { loadConnection } = await import("./receptionist/connections.server");
  const connection = await loadConnection(acting.accountId);
  const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
  const { GOOGLE_CALENDAR_SCOPES } = await import("./receptionist/calendar.server");
  try { return await authorizeAppUserOAuth({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectorId: "google_calendar", appUserId: context.userId, clientAPIKey, returnUrl: `${origin}/api/public/oauth/calendar/return`, connectionAPIKey: connection?.key, credentialsConfiguration: { scopes: GOOGLE_CALENDAR_SCOPES } }); }
  catch (err) { console.error("Calendar authorization failed", err); throw new Error("Google Calendar connection could not start. Please contact support."); }
});
export const completeReceptionistCalendar = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ code: z.string().min(1).max(2048) }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
  const { saveConnection } = await import("./receptionist/connections.server");
  const result = await exchangeAppUserOAuthCode("https://connector-gateway.lovable.dev", data.code);
  if (result.connectorId !== "google_calendar") throw new Error("Unexpected calendar connection.");
  // Owner-only operation: workspace account IDs are the owner's auth ID.
  // Persist the authenticated identity explicitly, never a teammate identity.
  await saveConnection(context.userId, result.connectionAPIKey);
  return { ok: true };
});
export const getReceptionistCalendars = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const acting = await workspace(context.userId, true);
  const { listWritableCalendars } = await import("./receptionist/calendar.server");
  return listWritableCalendars(acting.accountId);
});
export const disconnectReceptionistCalendar = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const acting = await workspace(context.userId, true);
  const { loadConnection } = await import("./receptionist/connections.server");
  const connection = await loadConnection(acting.accountId);
  if (connection) {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    await disconnectAppUser({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectorId: "google_calendar", connectionAPIKey: connection.key });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_user_connections").delete().eq("user_id", acting.accountId).eq("connector_id", "google_calendar");
    if (error) throw error;
  }
  return { ok: true };
});
export const createReceptionistAppointment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => appointmentInputSchema.parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { bookAppointment } = await import("./receptionist/calendar.server");
  return bookAppointment(acting.accountId, data);
});
export const cancelReceptionistAppointment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { cancelAppointment } = await import("./receptionist/calendar.server");
  return cancelAppointment(acting.accountId, data.id);
});
export const updateReceptionistLead = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["new","contacted","qualified","closed"]) }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin.from("receptionist_leads").update({ status: data.status }).eq("id", data.id).eq("account_id", acting.accountId).select("id").maybeSingle();
  if (error || !row) throw new Error("Lead could not be updated.");
  return { ok: true };
});
export const searchReceptionistNumbers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ country: z.string().length(2), type: z.enum(["mobile","local","national","toll-free"]).optional(), region: z.string().trim().max(60).optional() }).parse(input)).handler(async ({ context, data }) => {
  await workspace(context.userId, true);
  const { searchVoiceNumbers } = await import("./receptionist/provision.server");
  return searchVoiceNumbers({ country: data.country.toUpperCase(), type: data.type, region: data.region || undefined });
});
const numberTypeSchema = z.enum(["mobile","local","national","toll-free"]);
export const getReceptionistNumberRequirements = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ country: z.string().length(2), type: numberTypeSchema }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { getNumberRequirements } = await import("./receptionist/provision.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const country = data.country.toUpperCase();
  const [requirements, { data: s }] = await Promise.all([
    getNumberRequirements(country, data.type),
    supabaseAdmin.from("receptionist_settings").select("requirement_group_id,number_country,number_type").eq("account_id", acting.accountId).maybeSingle(),
  ]);
  return { requirements, paperworkDone: Boolean(s?.requirement_group_id && s.number_country === country && s.number_type === data.type) };
});
const addressSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), businessName: z.string().trim().min(1).max(160), street: z.string().trim().min(3).max(200), city: z.string().trim().min(1).max(100), region: z.string().trim().max(100), postalCode: z.string().trim().min(2).max(20), country: z.string().length(2) });
const paperworkValue = z.discriminatedUnion("kind", [
  z.object({ requirementId: z.string().min(1).max(64), kind: z.literal("textual"), text: z.string().trim().min(2).max(2000) }),
  z.object({ requirementId: z.string().min(1).max(64), kind: z.literal("address"), address: addressSchema }),
  z.object({ requirementId: z.string().min(1).max(64), kind: z.literal("document"), file: z.object({ name: z.string().min(1).max(200), base64: z.string().min(10).max(11_000_000) }) }),
]);
export const submitReceptionistPaperwork = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ country: z.string().length(2), type: numberTypeSchema, values: z.array(paperworkValue).max(20) }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { submitPaperwork } = await import("./receptionist/provision.server");
  await submitPaperwork(acting.accountId, data.country.toUpperCase(), data.type, data.values);
  return { ok: true };
});
export const buyReceptionistNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/), type: numberTypeSchema, country: z.string().length(2), confirmed: z.literal(true) }).parse(input)).handler(async ({ context, data }) => {
  const acting = await workspace(context.userId, true);
  const { purchaseVoiceNumber } = await import("./receptionist/provision.server");
  return purchaseVoiceNumber(acting.accountId, data.phoneNumber, data.type, data.country.toUpperCase());
});
export const refreshReceptionistNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const acting = await workspace(context.userId, true);
  const { refreshNumberOrder } = await import("./receptionist/provision.server");
  return { status: await refreshNumberOrder(acting.accountId) };
});
export const setupReceptionistAgent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const acting = await workspace(context.userId, true);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: s } = await supabaseAdmin.from("receptionist_settings").select("configuration,assistant_id").eq("account_id", acting.accountId).maybeSingle();
  const c = receptionistConfigSchema.parse(s?.configuration ?? {});
  if (!s || !c.businessName || !c.businessInformation || !c.greeting) throw new Error("Save your business name, greeting and business information first.");
  const { upsertAssistant } = await import("./receptionist/provision.server");
  const id = await upsertAssistant(acting.accountId, c, s.assistant_id ?? null);
  const { error } = await supabaseAdmin.from("receptionist_settings").update({ assistant_id: id, updated_at: new Date().toISOString() }).eq("account_id", acting.accountId);
  if (error) throw new Error("The AI agent was created but could not be saved.");
  return { ok: true, updated: Boolean(s.assistant_id) };
});
