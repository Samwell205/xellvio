import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSendingDomain } from "./email-domain-rules";

async function acting(userId: string) {
  const { resolveActingAccount, assertPermission } = await import("@/lib/acting-account.server");
  const a = await resolveActingAccount(userId);
  assertPermission(a, "settings");
  return a.accountId;
}

const COLS = "id,domain,status,dns_records,last_error,last_checked_at,verified_at,created_at";

export const listEmailDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const accountId = await acting(context.userId);
    const { data, error } = await context.supabase
      .from("email_sending_domains").select(COLS).eq("account_id", accountId).order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addEmailDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string }) => d)
  .handler(async ({ data, context }) => {
    const accountId = await acting(context.userId);
    const domain = normalizeSendingDomain(data.domain);
    if (!domain) throw new Error("Enter a domain like yourbusiness.com");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    // One business per domain: never let another account reuse a domain someone already connected.
    const { data: taken } = await admin.from("email_sending_domains").select("account_id").eq("domain", domain);
    if ((taken ?? []).some((r: any) => r.account_id !== accountId)) {
      throw new Error("This domain is already connected to another account. Contact support if it's yours.");
    }
    const { createOrFindDomain } = await import("./email-domains.server");
    const d = await createOrFindDomain(domain);
    const { error } = await admin.from("email_sending_domains").upsert({
      account_id: accountId, domain, provider_domain_id: d.id, dns_records: d.records,
      status: d.valid ? "verified" : "pending", verified_at: d.valid ? new Date().toISOString() : null,
      last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "account_id,domain" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkEmailDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const accountId = await acting(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row } = await admin.from("email_sending_domains")
      .select("id,account_id,provider_domain_id,verified_at").eq("id", data.id).maybeSingle();
    if (!row || row.account_id !== accountId) throw new Error("Domain not found");
    const { validateDomain } = await import("./email-domains.server");
    const now = new Date().toISOString();
    try {
      const v = await validateDomain(Number(row.provider_domain_id));
      await admin.from("email_sending_domains").update({
        status: v.valid ? "verified" : "pending", dns_records: v.records, last_checked_at: now,
        verified_at: v.valid ? (row.verified_at ?? now) : null, last_error: null, updated_at: now,
      }).eq("id", row.id);
      return { verified: v.valid, missing: v.records.filter((r) => !r.valid).length };
    } catch (e: any) {
      await admin.from("email_sending_domains").update({ last_checked_at: now, last_error: e.message, updated_at: now }).eq("id", row.id);
      throw e;
    }
  });
