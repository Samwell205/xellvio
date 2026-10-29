// Support tickets: creation, messages, customer emails, reminders/auto-close
// and inbound email replies. Server-only.

import { CLOSE_AFTER_MS, FOLLOWUP_STEP_MS, followupAction } from "./support-ticket-followup";
export { CLOSE_AFTER_MS };
export const REMINDER_AFTER_MS = FOLLOWUP_STEP_MS;

const SITE = () => (process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://xellvio.com");

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type TicketRow = {
  id: string; number: number; account_id: string | null; requester_email: string; requester_name: string | null;
  subject: string; status: "open" | "waiting" | "resolved" | "closed"; access_token: string;
  last_admin_reply_at: string | null; reminder_sent_at: string | null; closed_at: string | null;
};

export function ticketUrl(t: Pick<TicketRow, "access_token">) {
  return `${SITE()}/support/t/${t.access_token}`;
}

/** Reply-To address that routes email replies back into the ticket. */
export function replyAddress(t: Pick<TicketRow, "access_token">): string | undefined {
  const base = process.env.SUPPORT_INBOUND_ADDRESS; // e.g. support@reply.xellvio.com
  // No inbound mailbox wired to the app yet: send email replies to the owner's Outlook inbox.
  if (!base || !base.includes("@")) return "admin@xellvio.com";
  const [local, domain] = base.split("@");
  return `${local}+t-${t.access_token}@${domain}`;
}

async function email(t: TicketRow, kind: string, subject: string, heading: string, body: string, ctaText = "View your ticket") {
  try {
    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
    await sendBrandedEmail({
      templateName: "generic",
      recipientEmail: t.requester_email,
      idempotencyKey: `ticket-${t.id}-${kind}`,
      includeUnsubscribe: false,
      sendImmediately: true,
      replyTo: replyAddress(t),
      templateData: { subject: `[Ticket #${t.number}] ${subject}`, heading, body, ctaText, ctaUrl: ticketUrl(t) },
    });
  } catch (e) {
    console.error("[tickets] email failed", kind, e);
  }
}

async function notifyAdmin(t: TicketRow, text: string) {
  try {
    const { sendAdminPush } = await import("./admin-push.server");
    await sendAdminPush({ title: `Ticket #${t.number}`, body: text.slice(0, 140), url: `/admin/tickets/${t.id}`, tag: `ticket-${t.id}` });
  } catch { /* best effort */ }
  // Owner wants an email for every new ticket AND every customer follow-up.
  try {
    const { ADMIN_NOTIFY_EMAIL } = await import("./admin-notify.server");
    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");
    await sendBrandedEmail({
      templateName: "generic",
      recipientEmail: ADMIN_NOTIFY_EMAIL,
      idempotencyKey: `ticket-admin-${t.id}-${Date.now()}`,
      includeUnsubscribe: false,
      sendImmediately: true,
      replyTo: t.requester_email,
      templateData: {
        subject: `[Ticket #${t.number}] ${t.subject}`,
        heading: `Ticket #${t.number} needs attention`,
        body: text.slice(0, 4000),
        ctaText: "Open ticket",
        ctaUrl: `${SITE()}/admin/tickets/${t.id}`,
      },
    });
  } catch (e) {
    console.error("[tickets] admin email failed", e);
  }
}

async function matchAccount(emailAddr: string): Promise<string | null> {
  const sb = await db();
  const e = emailAddr.trim().toLowerCase();
  const { data } = await sb.from("accounts").select("id").or(`email.ilike.${e},contact_email.ilike.${e}`).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function createTicket(input: {
  email: string; name?: string | null; subject: string; topic?: string | null; message: string;
  source: "contact" | "app" | "email"; accountId?: string | null; previousTicketId?: string | null;
}): Promise<TicketRow> {
  const sb = await db();
  const now = new Date().toISOString();
  const accountId = input.accountId ?? (await matchAccount(input.email));
  const { data: t, error } = await sb.from("support_tickets").insert({
    requester_email: input.email.trim().toLowerCase(), requester_name: input.name ?? null,
    subject: input.subject.slice(0, 200), topic: input.topic ?? null, source: input.source,
    account_id: accountId, previous_ticket_id: input.previousTicketId ?? null, last_customer_reply_at: now,
  }).select("*").single();
  if (error) throw new Error(error.message);
  await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "customer", body: input.message, via: input.source === "email" ? "email" : "web" });
  const prev = input.previousTicketId ? "\n\nYour earlier ticket was closed, so we've opened this new one." : "";
  await email(t, "opened", t.subject,
    `Ticket #${t.number} has been received`,
    `Dear Valued Customer,\n\nThank you for reaching out to Xellvio Support. Your request has been received, and Ticket ID ${t.number} has been assigned to it. A support representative will be reaching out to you shortly.\n\nSubject: ${t.subject}\nTicket ID: ${t.number}${prev}\n\nYou can reply to this email or open your ticket page to add details. We sincerely appreciate your patience.\n\nKind regards,\nXellvio Support`);
  await notifyAdmin(t, `New ticket from ${t.requester_email}: ${input.message}`);
  return t;
}

/** Notify for a ticket atomically created by a paid-request database operation. */
export async function notifyTicketOpened(ticketId: string) {
  const sb = await db();
  const { data: t } = await sb.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) return;
  await email(t, "opened", t.subject, `Ticket #${t.number} is open`,
    "Your $100 assisted number-verification request has been received. Our support handling target is 24 hours. Carrier approval and number availability remain subject to checks; we will request any required documents through this ticket.");
  await notifyAdmin(t, "Paid assisted number-verification request awaiting review.");
}

export async function customerReply(ticketId: string, body: string, via: "web" | "email" = "web", files: AttachmentUpload[] = []) {
  const sb = await db();
  const { data: t } = await sb.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  if (t.status === "closed") throw new Error("This ticket is closed. Please open a new ticket.");
  const now = new Date().toISOString();
  const attachments = files.length ? await saveAttachments(t.id, files) : [];
  await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "customer", body, via, attachments });
  await sb.from("support_tickets").update({ status: "open", last_customer_reply_at: now, reminder_sent_at: null, updated_at: now }).eq("id", t.id);
  await notifyAdmin(t, `Reply from ${t.requester_email}: ${body}${attachments.length ? `\n\nAttached: ${attachments.map((a) => a.name).join(", ")}` : ""}`);
}

export async function adminReply(ticketId: string, body: string, userId: string, opts: { internal?: boolean; close?: boolean; resolve?: boolean } = {}) {
  const sb = await db();
  const { data: t } = await sb.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  const now = new Date().toISOString();
  const { data: msg } = await sb.from("support_ticket_messages")
    .insert({ ticket_id: t.id, author: "admin", author_user_id: userId, body, internal: !!opts.internal }).select("id").single();
  if (opts.internal) {
    await sb.from("support_tickets").update({ updated_at: now }).eq("id", t.id);
    return;
  }
  const status = opts.close ? "closed" : opts.resolve ? "resolved" : "waiting";
  await sb.from("support_tickets").update({
    status, last_admin_reply_at: now, reminder_sent_at: null, updated_at: now,
    closed_at: opts.close ? now : null, resolved_at: opts.resolve ? now : null,
  }).eq("id", t.id);
  await email(t, `reply-${msg?.id ?? now}`, t.subject, `New reply on ticket #${t.number}`,
    `${body}\n${opts.close ? "This ticket is now closed. If you need more help, please open a new ticket." : opts.resolve ? "We believe this solves your issue. Open your ticket to confirm and close it — you can also leave a quick rating — or reply if you still need help." : "Reply to this email or open your ticket page to respond."}`,
    opts.close ? "View ticket" : opts.resolve ? "Confirm & close your ticket" : "Reply on your ticket");
}

/** Admin marks a ticket resolved: customer confirms the fix and can leave feedback. */
export async function markTicketResolved(ticketId: string) {
  const sb = await db();
  const now = new Date().toISOString();
  const { data: t, error } = await sb.from("support_tickets")
    .update({ status: "resolved", resolved_at: now, reminder_sent_at: null, updated_at: now })
    .eq("id", ticketId).neq("status", "closed").select("*").maybeSingle();
  if (error) throw new Error(`Could not mark resolved: ${error.message}`);
  if (!t) throw new Error("Ticket not found or already closed");
  await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system", body: "Marked as resolved by support — waiting for the customer to confirm." });
  await email(t, `resolved-${now}`, t.subject, `Ticket #${t.number} — did we fix it?`,
    "We believe your issue is resolved. Please open your ticket to confirm and close it — you can leave a quick rating and feedback — or reply if you still need help.", "Confirm & close your ticket");
}

/** Customer confirms the fix: closes the ticket and stores optional 1–5 rating + feedback. */
export async function customerConfirmResolved(ticketId: string, rating: number | null, feedback: string | null) {
  const sb = await db();
  const { data: t } = await sb.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  if (t.status !== "resolved") throw new Error("This ticket is not waiting for your confirmation.");
  const now = new Date().toISOString();
  await sb.from("support_tickets").update({
    status: "closed", closed_at: now, updated_at: now,
    feedback_rating: rating, feedback_text: feedback, feedback_at: rating || feedback ? now : null,
  }).eq("id", t.id);
  await sb.from("support_ticket_messages").insert({
    ticket_id: t.id, author: "system",
    body: `Customer confirmed the fix and closed the ticket.${rating ? ` Rating: ${rating}/5.` : ""}${feedback ? ` Feedback: ${feedback}` : ""}`,
  });
  await notifyAdmin(t, `Ticket #${t.number} closed by the customer.${rating ? ` Rating: ${rating}/5.` : ""}${feedback ? ` Feedback: ${feedback}` : ""}`);
}

/** Customer says the issue is not fixed: ticket goes back to open. */
export async function customerReopenResolved(ticketId: string) {
  const sb = await db();
  const { data: t } = await sb.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  if (t.status !== "resolved") throw new Error("This ticket is not waiting for your confirmation.");
  const now = new Date().toISOString();
  await sb.from("support_tickets").update({ status: "open", resolved_at: null, updated_at: now }).eq("id", t.id);
  await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system", body: "Customer says the issue is not fixed — ticket reopened." });
  await notifyAdmin(t, `Ticket #${t.number} reopened: the customer says the issue is not fixed.`);
}

export async function setTicketStatus(ticketId: string, status: "open" | "closed") {
  const sb = await db();
  const now = new Date().toISOString();
  const { data: t } = await sb.from("support_tickets")
    .update({ status, closed_at: status === "closed" ? now : null, reminder_sent_at: null, updated_at: now })
    .eq("id", ticketId).select("*").single();
  if (t && status === "closed") {
    await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system", body: "Ticket closed by support." });
    await email(t, `closed-${now}`, t.subject, `Ticket #${t.number} is closed`,
      "This ticket has been closed. If you still need help, please open a new ticket — replies to a closed ticket start a new one.", "View ticket");
  }
}

/** Remind at 3h and 6h without a customer reply, close at 9h. Idempotent. */
export async function sweepTickets(now = Date.now()) {
  const sb = await db();
  const cutoff = new Date(now - REMINDER_AFTER_MS).toISOString();
  const { data: waiting } = await sb.from("support_tickets").select("*")
    .in("status", ["waiting", "resolved"])
    .or(`last_admin_reply_at.lte.${cutoff},and(status.eq.resolved,resolved_at.lte.${cutoff})`)
    .limit(200);
  let reminded = 0, closed = 0;
  for (const t of (waiting ?? []) as (TicketRow & { resolved_at: string | null })[]) {
    const stamp = t.status === "resolved" ? (t.resolved_at ?? t.last_admin_reply_at) : t.last_admin_reply_at;
    if (!stamp) continue;
    const action = followupAction(new Date(stamp).getTime(), t.reminder_sent_at ? new Date(t.reminder_sent_at).getTime() : null, now);
    const iso = new Date(now).toISOString();
    if (action === "close") {
      const { data: upd } = await sb.from("support_tickets").update({ status: "closed", closed_at: iso, updated_at: iso })
        .eq("id", t.id).in("status", ["waiting", "resolved"]).select("id");
      if (!upd?.length) continue;
      await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system", body: "Closed automatically after 9 hours without a reply." });
      await email(t, `autoclose-${stamp}`, t.subject, `Ticket #${t.number} has been closed`,
        `Dear Valued Customer,\n\nWe haven't heard back from you after two reminders, so ticket #${t.number} has been closed automatically.\n\nIf you still need help, simply open a new ticket and our support team will pick it up.\n\nKind regards,\nXellvio Support`, "View ticket");
      closed++;
    } else if (action === "reminder1" || action === "reminder2") {
      let q = sb.from("support_tickets").update({ reminder_sent_at: iso }).eq("id", t.id);
      q = t.reminder_sent_at ? q.eq("reminder_sent_at", t.reminder_sent_at) : q.is("reminder_sent_at", null);
      const { data: upd } = await q.select("id");
      if (!upd?.length) continue;
      const second = action === "reminder2";
      await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system",
        body: second ? "Final reminder sent to customer (6 hours without a reply)." : "Reminder sent to customer (3 hours without a reply)." });
      await email(t, `${action}-${stamp}`, t.subject, second ? "Final reminder: we're waiting for your reply" : "We're still waiting to hear from you",
        second
          ? `Dear Valued Customer,\n\nThis is a final reminder about ticket #${t.number}. If we don't hear back within 3 hours, this ticket will be closed automatically.\n\nKind regards,\nXellvio Support`
          : `Dear Valued Customer,\n\nWe're still waiting for your reply on ticket #${t.number}. If we don't hear back within 6 hours, this ticket will be closed automatically.\n\nKind regards,\nXellvio Support`,
        "Reply on your ticket");
      reminded++;
    }
  }
  return { reminded, closed };
}

/** Strip quoted history from an email reply. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^On .+wrote:$/i.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l) || /^From:\s/i.test(l) || /于.+写道[:：]/.test(l)) break;
    if (l.startsWith(">")) continue;
    out.push(l);
  }
  return out.join("\n").trim().slice(0, 8000);
}

/** Route an inbound email into the right ticket (or a new one). */
export async function handleInboundEmail(msg: { from: string; to: string[]; subject: string; text: string }) {
  const sb = await db();
  const fromEmail = (msg.from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "").toLowerCase();
  if (!fromEmail) return { ok: false, reason: "no_sender" };
  const body = stripQuoted(msg.text) || "(empty reply)";
  const token = msg.to.map((a) => a.match(/\+t-([a-f0-9]{48})@/i)?.[1]).find(Boolean);
  const num = msg.subject.match(/Ticket #(\d+)/i)?.[1];
  let t: TicketRow | null = null;
  if (token) t = (await sb.from("support_tickets").select("*").eq("access_token", token).maybeSingle()).data;
  if (!t && num) {
    const r = (await sb.from("support_tickets").select("*").eq("number", Number(num)).maybeSingle()).data;
    if (r && r.requester_email === fromEmail) t = r;
  }
  if (t && t.status !== "closed") {
    await customerReply(t.id, body, "email");
    return { ok: true, ticket: t.number };
  }
  const created = await createTicket({
    email: fromEmail, subject: msg.subject.replace(/^(re|fwd?):\s*/gi, "").replace(/\[Ticket #\d+\]\s*/i, "") || "Support request",
    message: body, source: "email", previousTicketId: t?.id ?? null,
  });
  return { ok: true, ticket: created.number, created: true };
}

// ---------- Attachments (private bucket, service-role only) ----------
export type TicketAttachment = { path: string; name: string; size: number; type: string; url?: string };
export type AttachmentUpload = { name: string; type: string; data: string };
const ATTACH_BUCKET = "support-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf|text\/(plain|csv)|application\/vnd\.(ms-excel|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document))|application\/msword)$/;

export async function saveAttachments(ticketId: string, files: AttachmentUpload[]): Promise<TicketAttachment[]> {
  const sb = await db();
  const out: TicketAttachment[] = [];
  for (const f of files.slice(0, 5)) {
    const type = f.type || "application/octet-stream";
    if (!ALLOWED.test(type)) throw new Error(`"${f.name}" is not a supported file type (images, PDF, CSV, Excel, Word or text).`);
    const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    if (bin.byteLength > MAX_BYTES) throw new Error(`"${f.name}" is larger than 10 MB.`);
    const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
    const path = `${ticketId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await sb.storage.from(ATTACH_BUCKET).upload(path, bin, { contentType: type });
    if (error) throw new Error(`Could not upload "${f.name}".`);
    out.push({ path, name: safe, size: bin.byteLength, type });
  }
  return out;
}

export async function signAttachments<T extends { attachments?: TicketAttachment[] | null }>(msgs: T[]): Promise<T[]> {
  const sb = await db();
  const paths = msgs.flatMap((m) => (m.attachments ?? []).map((a) => a.path));
  if (!paths.length) return msgs;
  const { data } = await sb.storage.from(ATTACH_BUCKET).createSignedUrls(paths, 3600);
  const map = new Map<string, string>((data ?? []).map((d: any) => [d.path, d.signedUrl]));
  return msgs.map((m) => ({ ...m, attachments: (m.attachments ?? []).map((a) => ({ ...a, url: map.get(a.path) })) }));
}
