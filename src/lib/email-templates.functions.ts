import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { emailBlockSchema, emailThemeSchema, EMAIL_MODES } from "./email-campaign-rules";

async function access(userId: string) {
  const { resolveActingAccount, assertPermission } = await import("./acting-account.server");
  const acting = await resolveActingAccount(userId);
  assertPermission(acting, "campaigns");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return { accountId: acting.accountId, db };
}
const COLS = "id,account_id,name,category,content_mode,subject,blocks,plain_body,html_body,theme,provider_template_id,updated_at";

/** Platform library (shared) plus this business's saved templates. */
export const listEmailTemplates = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { accountId, db } = await access(context.userId);
  const [own, lib, admin] = await Promise.all([
    db.from("email_templates").select(COLS).eq("account_id", accountId).order("updated_at", { ascending: false }).limit(200),
    db.from("email_templates").select(COLS).is("account_id", null).order("name").limit(200),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  if (own.error) throw own.error; if (lib.error) throw lib.error;
  return { saved: own.data ?? [], library: lib.data ?? [], isAdmin: !!admin.data };
});

const saveSchema = z.object({
  name: z.string().trim().min(1).max(120), subject: z.string().max(200).default(""),
  content_mode: z.enum(EMAIL_MODES), blocks: z.array(emailBlockSchema).max(60),
  plain_body: z.string().max(50000), html_body: z.string().max(400000), theme: emailThemeSchema.nullish(),
});
export const saveEmailTemplate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => saveSchema.parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { count } = await db.from("email_templates").select("id", { count: "exact", head: true }).eq("account_id", accountId);
  if ((count ?? 0) >= 200) throw new Error("You can keep up to 200 saved templates. Delete one to save another.");
  const { data: row, error } = await db.from("email_templates").insert({ ...data, theme: data.theme ?? {}, category: "Saved", account_id: accountId, created_by: context.userId }).select("id").single();
  if (error) throw error; return { id: row.id };
});
export const deleteEmailTemplate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => {
  const { accountId, db } = await access(context.userId);
  const { error } = await db.from("email_templates").delete().eq("id", data.id).eq("account_id", accountId);
  if (error) throw error; return { ok: true };
});

/** Admin only: copies the platform's provider email templates into the shared library. */
export const importProviderEmailTemplates = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
  const { emailProviderRequest } = await import("./email-campaigns.server");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let imported = 0, skipped = 0;
  for (const gen of ["dynamic", "legacy"]) {
    const res = await emailProviderRequest(`/templates?generations=${gen}&page_size=100`);
    if (!res.ok) { console.error("Template list failed", res.status, await res.text()); throw new Error("The email service did not return your templates. Try again shortly."); }
    const body = (await res.json()) as { result?: { id: string }[]; templates?: { id: string }[] };
    for (const t of body.result ?? body.templates ?? []) {
      const one = await emailProviderRequest(`/templates/${encodeURIComponent(t.id)}`);
      if (!one.ok) { skipped++; continue; }
      const full = (await one.json()) as { name?: string; versions?: { active?: number; html_content?: string; plain_content?: string; subject?: string; name?: string }[] };
      const v = full.versions?.find((x) => x.active === 1) ?? full.versions?.[0];
      if (!v?.html_content && !v?.plain_content) { skipped++; continue; }
      const html = (v.html_content ?? "").replace(/\{\{\s*first_name\s*\}\}|-first_name-|\{\{\s*firstName\s*\}\}/gi, "{{first_name}}");
      const row = { account_id: null, provider_template_id: t.id, name: (full.name || v.name || "Imported template").slice(0, 120), category: "Imported",
        content_mode: html ? "html" : "plain", html_body: html.slice(0, 400000), plain_body: (v.plain_content ?? "").slice(0, 50000),
        subject: (v.subject ?? "").replace(/\{\{[^}]*\}\}/g, "").slice(0, 200), blocks: [], theme: {}, created_by: context.userId, updated_at: new Date().toISOString() };
      const { data: existing } = await db.from("email_templates").select("id").is("account_id", null).eq("provider_template_id", t.id).maybeSingle();
      const { error } = existing ? await db.from("email_templates").update(row).eq("id", existing.id) : await db.from("email_templates").insert(row);
      if (error) { console.error(error); skipped++; } else imported++;
    }
  }
  return { imported, skipped };
});
