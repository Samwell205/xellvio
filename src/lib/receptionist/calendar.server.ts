import { loadConnection } from "./connections.server";
import { appointmentInputSchema, isWithinBusinessHours, receptionistConfigSchema } from "./shared";

export const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"];
export async function calendarRequest(userId: string, path: string, init?: RequestInit) {
  const connection = await loadConnection(userId);
  if (!connection || connection.reconnectRequired) throw new Error("Reconnect Google Calendar before booking appointments.");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const response = await callAsAppUser({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectorId: "google_calendar", connectionAPIKey: connection.key, path: `/calendar/v3${path}`, init, requiredScopes: GOOGLE_CALENDAR_SCOPES });
  if (await appUserReconnectRequired(response)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("app_user_connections").update({ reconnect_required: true }).eq("user_id", userId).eq("connector_id", "google_calendar");
    throw new Error("Your Google Calendar access needs to be renewed.");
  }
  if (!response.ok) {
    const body = await response.text();
    console.error(`Calendar request failed [${response.status}]: ${body}`);
    throw new Error(`Google Calendar could not complete this request (${response.status}). No booking has been confirmed.`);
  }
  return response.json();
}
export async function listWritableCalendars(userId: string) {
  const data = await calendarRequest(userId, "/users/me/calendarList?minAccessRole=writer&maxResults=250");
  return (data.items ?? []).map((item: { id: string; summary: string; timeZone?: string }) => ({ id: item.id, name: item.summary, timezone: item.timeZone ?? null }));
}
export async function calendarBusy(userId: string, calendarId: string, start: string, end: string): Promise<boolean> {
  const data = await calendarRequest(userId, "/freeBusy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id: calendarId }] }) });
  const calendar = data.calendars?.[calendarId];
  if (!calendar || calendar.errors?.length) throw new Error("Calendar availability could not be verified.");
  return Boolean(calendar.busy?.length);
}
export async function bookAppointment(accountId: string, raw: unknown, callId?: string) {
  const input = appointmentInputSchema.parse(raw);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings, error: settingsError } = await supabaseAdmin.from("receptionist_settings").select("configuration").eq("account_id", accountId).maybeSingle();
  if (settingsError) throw settingsError;
  const config = receptionistConfigSchema.parse(settings?.configuration ?? {});
  if (!config.calendarId) throw new Error("Select a business calendar first.");
  const end = new Date(Date.parse(input.startsAt) + config.appointmentMinutes * 60000).toISOString();
  if (Date.parse(input.startsAt) <= Date.now() || !isWithinBusinessHours(input.startsAt, end, config)) throw new Error("Choose a future appointment during business hours.");
  const { data: existing, error: existingError } = await supabaseAdmin.from("receptionist_appointments").select("id,status,starts_at,ends_at,name,phone_e164,event_id").eq("account_id", accountId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (Date.parse(existing.starts_at) !== Date.parse(input.startsAt) || existing.name !== input.name || existing.phone_e164 !== input.phone) throw new Error("This booking reference has already been used.");
    return { id: existing.id, status: existing.status, startsAt: existing.starts_at };
  }
  const bufferedStart = new Date(Date.parse(input.startsAt) - config.bufferMinutes * 60000).toISOString();
  const bufferedEnd = new Date(Date.parse(end) + config.bufferMinutes * 60000).toISOString();
  if (await calendarBusy(accountId, config.calendarId, bufferedStart, bufferedEnd)) throw new Error("That appointment time is unavailable.");
  const { data: overlaps, error: overlapError } = await supabaseAdmin.from("receptionist_appointments").select("id").eq("account_id", accountId).in("status", ["pending","confirmed","uncertain"]).lt("starts_at", bufferedEnd).gt("ends_at", bufferedStart).limit(1);
  if (overlapError) throw overlapError;
  if (overlaps?.length) throw new Error("That appointment time is already reserved.");
  const eventId = input.idempotencyKey.replaceAll("-", "");
  const { data: reservation, error } = await supabaseAdmin.from("receptionist_appointments").insert({ account_id: accountId, call_id: callId ?? null, calendar_id: config.calendarId, event_id: eventId, name: input.name, phone_e164: input.phone, email: input.email || null, starts_at: input.startsAt, ends_at: end, idempotency_key: input.idempotencyKey }).select("id").single();
  if (error || !reservation) throw new Error("This time could not be reserved. Please choose another time.");
  try {
    if (await calendarBusy(accountId, config.calendarId, bufferedStart, bufferedEnd)) {
      await supabaseAdmin.from("receptionist_appointments").update({ status: "failed", error: "Calendar became unavailable" }).eq("id", reservation.id);
      throw new Error("That time was just taken. Choose another time.");
    }
    const event = await calendarRequest(accountId, `/calendars/${encodeURIComponent(config.calendarId)}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: eventId, summary: `${input.name} — ${config.businessName || "Appointment"}`, description: `Requested appointment. Contact: ${input.phone}${input.email ? `, ${input.email}` : ""}`, start: { dateTime: input.startsAt, timeZone: config.timezone }, end: { dateTime: end, timeZone: config.timezone } }) });
    if (event.id !== eventId || event.status === "cancelled") throw new Error("Calendar did not confirm the appointment.");
    const { error: saveError } = await supabaseAdmin.from("receptionist_appointments").update({ status: "confirmed", error: null }).eq("id", reservation.id);
    if (saveError) throw saveError;
    return { id: reservation.id, status: "confirmed", startsAt: input.startsAt };
  } catch (err) {
    // An interrupted provider response may still have created the event: never tell callers it failed or free this reservation without reconciliation.
    await supabaseAdmin.from("receptionist_appointments").update({ status: "uncertain", error: "Calendar confirmation needs checking" }).eq("id", reservation.id).eq("status", "pending");
    throw err;
  }
}
export async function cancelAppointment(accountId: string, id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("receptionist_appointments").select("calendar_id,event_id,status").eq("account_id", accountId).eq("id", id).single();
  if (error || !data?.event_id) throw new Error("Appointment not found.");
  if (data.status === "cancelled") return { ok: true };
  // GET makes cancellation idempotent and reconciles uncertain create results.
  const connection = await loadConnection(accountId);
  if (!connection || connection.reconnectRequired) throw new Error("Reconnect Google Calendar first.");
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  const response = await callAsAppUser({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectorId: "google_calendar", connectionAPIKey: connection.key, path: `/calendar/v3/calendars/${encodeURIComponent(data.calendar_id)}/events/${encodeURIComponent(data.event_id)}`, init: { method: "DELETE" }, requiredScopes: GOOGLE_CALENDAR_SCOPES });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    console.error(`Calendar cancellation failed [${response.status}]: ${await response.text()}`);
    throw new Error("Calendar cancellation was not confirmed. The reservation is still held.");
  }
  const { error: saveError } = await supabaseAdmin.from("receptionist_appointments").update({ status: "cancelled", error: null }).eq("account_id", accountId).eq("id", id);
  if (saveError) throw saveError;
  return { ok: true };
}