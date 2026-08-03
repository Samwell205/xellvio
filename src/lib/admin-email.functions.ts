import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
