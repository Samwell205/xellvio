// Support tickets: creation, messages, customer emails, reminders/auto-close
// and inbound email replies. Server-only.

export const REMINDER_AFTER_MS = 24 * 3600_000;
export const CLOSE_AFTER_MS = 72 * 3600_000;

const SITE = () => (process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://xellvio.com");

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type TicketRow = {
  id: string; number: number; account_id: string | null; requester_email: string; requester_name: string | null;
  subject: string; status: "open" | "waiting" | "closed"; access_token: string;
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
  const prev = input.previousTicketId ? " Your earlier ticket was closed, so we've opened this new one." : "";
  await email(t, "opened", t.subject,
    `Ticket #${t.number} is open`,
    `Thanks for contacting Xellvio Support. We've received your message and opened ticket #${t.number}.${prev}\nWe'll reply within one business day. You can reply to this email or open your ticket page to add details.`);
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

export async function customerReply(ticketId: string, body: string, via: "web" | "email" = "web") {
  const sb = await db();
  const { data: t } = await sb.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  if (t.status === "closed") throw new Error("This ticket is closed. Please open a new ticket.");
  const now = new Date().toISOString();
  await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "customer", body, via });
  await sb.from("support_tickets").update({ status: "open", last_customer_reply_at: now, reminder_sent_at: null, updated_at: now }).eq("id", t.id);
  await notifyAdmin(t, `Reply from ${t.requester_email}: ${body}`);
}

export async function adminReply(ticketId: string, body: string, userId: string, opts: { internal?: boolean; close?: boolean } = {}) {
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
  const status = opts.close ? "closed" : "waiting";
  await sb.from("support_tickets").update({
    status, last_admin_reply_at: now, reminder_sent_at: null, updated_at: now, closed_at: opts.close ? now : null,
  }).eq("id", t.id);
  await email(t, `reply-${msg?.id ?? now}`, t.subject, `New reply on ticket #${t.number}`,
    `${body}\n${opts.close ? "This ticket is now closed. If you need more help, please open a new ticket." : "Reply to this email or open your ticket page to respond."}`,
    opts.close ? "View ticket" : "Reply on your ticket");
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

/** Hourly: remind after 24h without a customer reply, close after 72h. Idempotent. */
export async function sweepTickets(now = Date.now()) {
  const sb = await db();
  const { data: waiting } = await sb.from("support_tickets").select("*")
    .eq("status", "waiting").lte("last_admin_reply_at", new Date(now - REMINDER_AFTER_MS).toISOString()).limit(200);
  let reminded = 0, closed = 0;
  for (const t of (waiting ?? []) as TicketRow[]) {
    const since = now - new Date(t.last_admin_reply_at!).getTime();
    if (since >= CLOSE_AFTER_MS) {
      const iso = new Date(now).toISOString();
      const { data: upd } = await sb.from("support_tickets").update({ status: "closed", closed_at: iso, updated_at: iso })
        .eq("id", t.id).eq("status", "waiting").select("id");
      if (!upd?.length) continue;
      await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system", body: "Closed automatically after 72 hours without a reply." });
      await email(t, `autoclose-${t.last_admin_reply_at}`, t.subject, `Ticket #${t.number} has been closed`,
        "We haven't heard back from you, so we've closed this ticket. If you still need help, just open a new ticket and we'll pick it up.", "View ticket");
      closed++;
    } else if (!t.reminder_sent_at) {
      const iso = new Date(now).toISOString();
      const { data: upd } = await sb.from("support_tickets").update({ reminder_sent_at: iso })
        .eq("id", t.id).is("reminder_sent_at", null).select("id");
      if (!upd?.length) continue;
      await sb.from("support_ticket_messages").insert({ ticket_id: t.id, author: "system", body: "Reminder sent to customer (24 hours without a reply)." });
      await email(t, `reminder-${t.last_admin_reply_at}`, t.subject, `We're still waiting to hear from you`,
        `We're still waiting for your reply on ticket #${t.number}. If we don't hear back within 48 hours, we'll close this ticket.`, "Reply on your ticket");
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
