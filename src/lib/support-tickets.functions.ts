import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}
async function acting(userId: string) {
  const { resolveActingAccount } = await import("./acting-account.server");
  return resolveActingAccount(userId);
}

const PUBLIC_TICKET = "id,number,subject,status,created_at,closed_at,resolved_at,feedback_rating,feedback_text,requester_name";
const token = z.string().regex(/^[a-f0-9]{48}$/);
const body = z.string().trim().min(1).max(8000);
const files = z.array(z.object({ name: z.string().min(1).max(200), type: z.string().max(120), data: z.string().max(14_000_000) })).max(5).default([]);
async function sign(msgs: any[] | null) {
  const { signAttachments } = await import("./support-tickets.server");
  return signAttachments(msgs ?? []);
}

export type TicketMessage = { id: string; author: "customer" | "admin" | "system"; body: string; internal: boolean; via: string; created_at: string; attachments?: { name: string; size: number; type: string; url?: string; path: string }[] };

// ---------- Public (private link) ----------
export const getTicketByToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select(PUBLIC_TICKET).eq("access_token", data.token).maybeSingle();
    if (!t) return null;
    const { data: msgs } = await sb.from("support_ticket_messages").select("id,author,body,via,created_at,attachments")
      .eq("ticket_id", t.id).eq("internal", false).order("created_at");
    return { ticket: t, messages: (await sign(msgs)) as TicketMessage[] };
  });

export const replyByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token, body, files }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("id").eq("access_token", data.token).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { customerReply } = await import("./support-tickets.server");
    await customerReply(t.id, data.body, "web", data.files);
    return { ok: true };
  });

const feedbackInput = {
  rating: z.number().int().min(1).max(5).nullish(),
  feedback: z.string().trim().max(2000).nullish(),
};

export const confirmResolvedByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token, ...feedbackInput }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("id").eq("access_token", data.token).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { customerConfirmResolved } = await import("./support-tickets.server");
    await customerConfirmResolved(t.id, data.rating ?? null, data.feedback || null);
    return { ok: true };
  });

export const reopenResolvedByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("id").eq("access_token", data.token).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { customerReopenResolved } = await import("./support-tickets.server");
    await customerReopenResolved(t.id);
    return { ok: true };
  });

// ---------- Tenant ----------
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { data } = await sb.from("support_tickets").select(`${PUBLIC_TICKET},updated_at`)
      .eq("account_id", a.accountId).order("updated_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const createMyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subject: z.string().trim().min(3).max(200), body }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { data: acct } = await sb.from("accounts").select("email,contact_email,legal_business_name").eq("id", a.accountId).maybeSingle();
    const { data: u } = await sb.auth.admin.getUserById(context.userId);
    const email = u?.user?.email || acct?.contact_email || acct?.email;
    if (!email) throw new Error("Your account has no email address.");
    const { createTicket } = await import("./support-tickets.server");
    const t = await createTicket({ email, name: acct?.legal_business_name ?? null, subject: data.subject, message: data.body, source: "app", accountId: a.accountId });
    return { id: t.id };
  });

export const getMyTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select(PUBLIC_TICKET).eq("id", data.id).eq("account_id", a.accountId).maybeSingle();
    if (!t) return null;
    const { data: msgs } = await sb.from("support_ticket_messages").select("id,author,body,via,created_at,attachments")
      .eq("ticket_id", t.id).eq("internal", false).order("created_at");
    return { ticket: t, messages: (await sign(msgs)) as TicketMessage[] };
  });

export const replyMyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), body, files }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("id").eq("id", data.id).eq("account_id", a.accountId).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { customerReply } = await import("./support-tickets.server");
    await customerReply(t.id, data.body, "web", data.files);
    return { ok: true };
  });

// ---------- Tenant: resolution confirmation + unread badge ----------
export const confirmMyTicketResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), ...feedbackInput }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("id").eq("id", data.id).eq("account_id", a.accountId).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { customerConfirmResolved } = await import("./support-tickets.server");
    await customerConfirmResolved(t.id, data.rating ?? null, data.feedback || null);
    return { ok: true };
  });

export const reopenMyResolvedTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("id").eq("id", data.id).eq("account_id", a.accountId).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { customerReopenResolved } = await import("./support-tickets.server");
    await customerReopenResolved(t.id);
    return { ok: true };
  });

/** Tenant badge: tickets waiting on the customer (admin replied or resolved, no customer reply yet). */
export const myTicketAlertCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acting(context.userId);
    const sb = await db();
    const { count } = await sb.from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("account_id", a.accountId)
      .or("status.eq.resolved,and(status.eq.waiting,last_admin_reply_at.gt.last_customer_reply_at)");
    return count ?? 0;
  });

// ---------- Admin ----------
export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.enum(["open", "waiting", "resolved", "closed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await db();
    const [{ data: rows }, counts] = await Promise.all([
      sb.from("support_tickets").select("id,number,subject,status,requester_email,requester_name,account_id,updated_at,created_at")
        .eq("status", data.status).order("updated_at", { ascending: false }).limit(200),
      Promise.all(["open", "waiting", "resolved", "closed"].map((s) =>
        sb.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", s).then((r: any) => [s, r.count ?? 0]))),
    ]);
    return { rows: rows ?? [], counts: Object.fromEntries(counts) as Record<string, number> };
  });

/** Admin badge: open tickets needing a reply. */
export const adminOpenTicketCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const sb = await db();
    const { count } = await sb.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open");
    return count ?? 0;
  });

export const adminGetTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("*").eq("id", data.id).maybeSingle();
    if (!t) return null;
    const [{ data: msgs }, acct] = await Promise.all([
      sb.from("support_ticket_messages").select("id,author,body,internal,via,created_at,attachments").eq("ticket_id", t.id).order("created_at"),
      t.account_id ? sb.from("accounts").select("id,email,legal_business_name,credit_balance,sending_suspended_at").eq("id", t.account_id).maybeSingle().then((r: any) => r.data) : null,
    ]);
    const { access_token: _omit, ...safe } = t;
    return { ticket: safe, messages: (await sign(msgs)) as TicketMessage[], account: acct };
  });

export const adminReplyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), body, internal: z.boolean().default(false), close: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const { adminReply } = await import("./support-tickets.server");
    await adminReply(data.id, data.body, context.userId, { internal: data.internal, close: data.close });
    return { ok: true };
  });

export const adminSetTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["open", "closed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const { setTicketStatus } = await import("./support-tickets.server");
    await setTicketStatus(data.id, data.status);
    return { ok: true };
  });

/** Copilot draft only — never sends. */
export const adminDraftTicketReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await db();
    const { data: t } = await sb.from("support_tickets").select("*").eq("id", data.id).maybeSingle();
    if (!t) throw new Error("Ticket not found");
    const { data: msgs } = await sb.from("support_ticket_messages").select("author,body,internal,created_at").eq("ticket_id", t.id).order("created_at");
    const { buildTenantSnapshot, buildPlatformSnapshot, COPILOT_PROMPT } = await import("./support-copilot.server");
    const [snapshot, platform] = await Promise.all([
      t.account_id ? buildTenantSnapshot(t.account_id) : Promise.resolve(null),
      buildPlatformSnapshot().catch(() => "unavailable"),
    ]);
    const system = `${COPILOT_PROMPT}\n\nToday: ${new Date().toISOString().slice(0, 10)}\n\n${
      snapshot ? `TENANT ACCOUNT DATA (live):\n${snapshot}` : "No tenant account matches this ticket's email; answer generally and do not invent account details."
    }\n\nPLATFORM HEALTH (live):\n${platform}\n\nTASK: Write ONLY the reply to send to the customer on this support ticket, as plain text with no markdown fences, no analysis, no ACTION lines. Sign off as "Xellvio Support".`;
    const transcript = (msgs ?? []).map((m: any) => `[${m.author}${m.internal ? " (internal note)" : ""}] ${m.body}`).join("\n\n");
    const { getChatModel } = await import("./ai-provider.server");
    const { streamText } = await import("ai");
    const model = await getChatModel();
    if (!model) throw new Error("AI is not configured");
    try {
      const r = streamText({ model, system, messages: [{ role: "user", content: `Ticket #${t.number} — ${t.subject}\nFrom: ${t.requester_email}\n\n${transcript}` }] });
      const text = (await r.text).trim().replace(/^```(?:reply)?\s*|```$/g, "").trim();
      return { draft: text };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/429|rate.?limit/i.test(m)) throw new Error("Too many requests — try again in a moment.");
      if (/402|credit/i.test(m)) throw new Error("AI credits are used up. Top up in Settings → Plans & credits.");
      throw new Error("The copilot had a problem. Please try again.");
    }
  });
