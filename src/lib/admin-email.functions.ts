import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { noticePrice, uniqueNoticeRecipients } from './sms-pricing-notice';

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}

/** Tenants that can receive an operational notice. */
export const adminListEmailRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: accounts, error }, { data: suppressed }] = await Promise.all([
      supabaseAdmin
        .from("accounts")
        .select("id,email,full_name,company,credit_balance,created_at")
        .not("email", "is", null)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("suppressed_emails").select("email"),
    ]);
    if (error) throw new Error(error.message);
    const blocked = new Set((suppressed ?? []).map((s: any) => String(s.email).toLowerCase()));
    return (accounts ?? []).map((a: any) => ({
      id: a.id as string,
      email: (a.email as string) ?? "",
      name: (a.full_name as string) || (a.company as string) || "",
      credit_balance: Number(a.credit_balance ?? 0),
      suppressed: blocked.has(String(a.email ?? "").toLowerCase()),
    }));
  });

const sendSchema = z.object({
  accountIds: z.array(z.string().uuid()).min(1).max(2000),
  subject: z.string().trim().min(3).max(150),
  heading: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(6000),
  ctaText: z.string().trim().max(40).optional(),
  ctaUrl: z.string().trim().url().max(500).optional(),
});

/** Sends an operational/service notice to selected tenants (one email each). */
export const adminSendTenantNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendBrandedEmail } = await import("@/lib/email/send-internal.server");

    const { data: accounts, error } = await supabaseAdmin
      .from("accounts")
      .select("id,email,full_name,company")
      .in("id", data.accountIds);
    if (error) throw new Error(error.message);

    const runId = `notice-${Date.now().toString(36)}`;
    let queued = 0;
    const failures: { email: string; reason: string }[] = [];

    for (const account of accounts ?? []) {
      const email = String(account.email ?? "").trim();
      if (!email) continue;
      const firstName =
        String(account.full_name ?? account.company ?? "").split(" ")[0] || "there";
      const result = await sendBrandedEmail({
        templateName: "generic",
        recipientEmail: email,
        idempotencyKey: `${runId}-${account.id}`,
        templateData: {
          subject: data.subject,
          heading: data.heading,
          body: data.body.replace(/\{\{\s*name\s*\}\}/gi, firstName),
          ...(data.ctaText && data.ctaUrl
            ? { ctaText: data.ctaText, ctaUrl: data.ctaUrl }
            : {}),
        },
      });
      if (result.success) queued += 1;
      else failures.push({ email, reason: result.reason ?? "send_failed" });
    }

    return { runId, queued, failed: failures.length, failures: failures.slice(0, 25) };
  });

/** Recent notice sends for the dashboard table. */
export const adminRecentNotices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_send_log")
      .select("message_id,template_name,recipient_email,status,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const latest = new Map<string, any>();
    for (const row of data ?? []) {
      if (!row.message_id) continue;
      if (!latest.has(row.message_id)) latest.set(row.message_id, row);
    }
    return Array.from(latest.values()).slice(0, 100);
  });

export const adminPricingNoticePreview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin: sb } = await import('@/integrations/supabase/client.server');
    const [{ data: accounts, error }, { data: blocked, error: blockedError }, { data: rates, error: rateError }] = await Promise.all([
      sb.from('accounts').select('id,email,full_name').not('email', 'is', null),
      sb.from('suppressed_emails').select('email'),
      sb.from('country_rates').select('country_code,dial_prefix,sell_price').in('country_code', ['US', 'PR']),
    ]);
    if (error || blockedError || rateError) throw new Error('Could not load notice recipients and pricing');
    const recipients = uniqueNoticeRecipients(accounts ?? [], (blocked ?? []).map((r) => r.email));
    const usRate = noticePrice(rates ?? [], '+12125550123', 1);
    const prRate = noticePrice(rates ?? [], '+17875550123', 1);
    const { render } = await import('@react-email/components');
    const { createElement } = await import('react');
    const { default: Notice } = await import('./email-templates/sms-pricing-notice');
    const html = await render(createElement(Notice, { usRate, prRate }));
    return { html, usRate, prRate, accountIds: recipients.map((r) => r.id), excluded: (accounts ?? []).length - recipients.length };
  });

/** Fixed pricing event, external email service only; never the app-email queue. */
export const adminSendPricingNoticeBatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accountIds: z.array(z.string().uuid()).min(1).max(40) }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const key = process.env.RESEND_API_KEY;
    const gatewayKey = process.env.LOVABLE_API_KEY;
    if (!key || !gatewayKey) throw new Error('The external email service is not configured; no notices were sent');
    const { supabaseAdmin: sb } = await import('@/integrations/supabase/client.server');
    const [{ data: accounts, error }, { data: blocked, error: blockedError }, { data: rates, error: rateError }] = await Promise.all([
      sb.from('accounts').select('id,email,full_name').in('id', data.accountIds),
      sb.from('suppressed_emails').select('email'),
      sb.from('country_rates').select('country_code,dial_prefix,sell_price').in('country_code', ['US', 'PR']),
    ]);
    if (error || blockedError || rateError) throw new Error('Could not validate pricing notice recipients');
    const usRate = noticePrice(rates ?? [], '+12125550123', 1);
    const prRate = noticePrice(rates ?? [], '+17875550123', 1);
    if (usRate !== 0.0165 || prRate !== 0.048) throw new Error('Prices changed. Review a fresh notice before sending');
    const recipients = uniqueNoticeRecipients(accounts ?? [], (blocked ?? []).map((r) => r.email));
    const { render } = await import('@react-email/components');
    const { createElement } = await import('react');
    const { default: Notice, PRICING_NOTICE_SUBJECT } = await import('./email-templates/sms-pricing-notice');
    let sent = 0;
    let alreadySent = 0;
    for (const account of recipients) {
      const email = account.email?.trim().toLowerCase();
      if (!email) continue;
      const messageId = `sms-pricing-20261105-${account.id}`;
      const { data: existing, error: logError } = await sb.from('email_send_log').select('id').eq('message_id', messageId).eq('status', 'sent').limit(1);
      if (logError) throw new Error('Could not check previous notice sends');
      if (existing?.length) { alreadySent++; continue; }
      const { data: saved, error: tokenReadError } = await sb.from('email_unsubscribe_tokens').select('token').eq('email', email).maybeSingle();
      if (tokenReadError) throw new Error('Could not check email preferences');
      const token = saved?.token || crypto.randomUUID();
      if (!saved?.token) {
        const { error: tokenError } = await sb.from('email_unsubscribe_tokens').upsert({ email, token }, { onConflict: 'email' });
        if (tokenError) throw new Error('Could not create the email preference link');
      }
      const unsubscribeUrl = `https://xellvio.com/unsubscribe?token=${encodeURIComponent(token)}`;
      const element = createElement(Notice, { usRate, prRate, name: account.full_name?.split(' ')[0], unsubscribeUrl });
      const html = await render(element);
      const text = await render(element, { plainText: true });
      const response = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': key, 'Idempotency-Key': messageId },
        body: JSON.stringify({ from: 'Xellvio <admin@xellvio.com>', to: [email], subject: PRICING_NOTICE_SUBJECT, html, text,
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Pricing notice failed [${response.status}]: ${errorBody}`);
        throw new Error(`Email service rejected the notice [${response.status}]: ${errorBody}`);
      }
      const result = await response.json() as { id?: string };
      if (!result.id) throw new Error('Email service did not confirm acceptance');
      const { error: saveError } = await sb.from('email_send_log').insert({ message_id: messageId, template_name: 'sms-pricing-notice', recipient_email: email, status: 'sent' });
      if (saveError) throw new Error('Email accepted, but could not save its status. Do not resend blindly');
      sent++;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return { sent, alreadySent, excluded: (accounts ?? []).length - recipients.length };
  });
