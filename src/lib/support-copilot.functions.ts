import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CopilotMessage = { role: "user" | "assistant"; content: string; at: string };

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const listSupportCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { data, error } = await sb.from("support_cases")
      .select("id, title, account_id, updated_at").order("updated_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; title: string; account_id: string | null; updated_at: string }[];
  });

export const createSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { data, error } = await sb.from("support_cases").insert({ created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: data.id as string };
  });

export const deleteSupportCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { error } = await sb.from("support_cases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSupportCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { data: row, error } = await sb.from("support_cases").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Case not found");
    let tenant: { id: string; email: string | null; company: string | null } | null = null;
    if (row.account_id) {
      const { data: a } = await sb.from("accounts").select("id, email, company").eq("id", row.account_id).maybeSingle();
      tenant = a ?? null;
    }
    return { id: row.id as string, title: row.title as string, messages: (row.messages ?? []) as CopilotMessage[], tenant };
  });

export const searchTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const q = data.q.replace(/[%,()]/g, "");
    const { data: rows, error } = await sb.from("accounts").select("id, email, company, full_name")
      .or(`email.ilike.%${q}%,company.ilike.%${q}%,full_name.ilike.%${q}%`).limit(10);
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; email: string | null; company: string | null; full_name: string | null }[];
  });

export const setCaseTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), accountId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { error } = await sb.from("support_cases").update({ account_id: data.accountId, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), message: z.string().trim().min(1).max(8000) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { data: row, error } = await sb.from("support_cases").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Case not found");

    // Auto-detect the tenant from emails or phone numbers in the pasted message
    // (and earlier messages in this case).
    let accountId: string | null = row.account_id;
    if (!accountId) {
      const haystack = [data.message, ...((row.messages ?? []) as CopilotMessage[]).filter((m) => m.role === "user").map((m) => m.content)].join("\n");
      const emails = Array.from(new Set((haystack.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e) => e.toLowerCase().replace(/[.,;:]+$/, "")))).slice(0, 10);
      for (const email of emails) {
        const { data: a } = await sb.from("accounts").select("id").or(`email.ilike.${email},contact_email.ilike.${email}`).limit(1).maybeSingle();
        if (a) { accountId = a.id; break; }
        const { data: cm } = await sb.from("contact_messages").select("user_id").ilike("email", email).not("user_id", "is", null).limit(1).maybeSingle();
        if ((cm as any)?.user_id) { accountId = (cm as any).user_id; break; }
      }
      if (!accountId) {
        const phones = Array.from(new Set((haystack.match(/\+?\d[\d\s().-]{8,16}\d/g) ?? [])
          .map((p) => p.replace(/\D/g, "")).filter((d) => d.length >= 10 && d.length <= 15)
          .map((d) => (d.length === 10 ? `+1${d}` : `+${d}`)))).slice(0, 10);
        for (const phone of phones) {
          const [sa, acc, num, tfn] = await Promise.all([
            sb.from("sender_assets").select("account_id").eq("phone_number", phone).not("account_id", "is", null).limit(1).maybeSingle(),
            sb.from("accounts").select("id").eq("telnyx_phone_number", phone).limit(1).maybeSingle(),
            sb.from("numbers").select("account_id").eq("phone_number", phone).limit(1).maybeSingle(),
            sb.from("verifier_tfns").select("sold_to_account_id").eq("phone_number", phone).not("sold_to_account_id", "is", null).limit(1).maybeSingle(),
          ]);
          accountId = sa.data?.account_id ?? acc.data?.id ?? num.data?.account_id ?? tfn.data?.sold_to_account_id ?? null;
          if (accountId) break;
        }
      }
    }

    const { buildTenantSnapshot, buildPlatformSnapshot, COPILOT_PROMPT } = await import("./support-copilot.server");
    const [snapshot, platform] = await Promise.all([
      accountId ? buildTenantSnapshot(accountId) : Promise.resolve(null),
      buildPlatformSnapshot().catch((e) => `Platform check failed: ${e instanceof Error ? e.message : e}`),
    ]);
    const system = `${COPILOT_PROMPT}\n\nToday: ${new Date().toISOString().slice(0, 10)}\n\n${
      snapshot ? `TENANT ACCOUNT DATA (live):\n${snapshot}` : "No tenant is linked to this case yet. If the question is about a specific tenant, tell the admin to link them."
    }\n\nPLATFORM HEALTH (live):\n${platform}`;

    const history = (row.messages ?? []) as CopilotMessage[];
    const now = new Date().toISOString();
    const msgs = [...history, { role: "user" as const, content: data.message, at: now }];

    const { getChatModel } = await import("./ai-provider.server");
    const { streamText } = await import("ai");
    const model = await getChatModel();
    if (!model) throw new Error("AI is not configured");
    let reply: string;
    try {
      const result = streamText({ model, system, messages: msgs.map(({ role, content }) => ({ role, content })) });
      reply = (await result.text).trim();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/429|rate.?limit/i.test(m)) throw new Error("Too many requests — try again in a moment.");
      if (/402|credit/i.test(m)) throw new Error("AI credits are used up. Top up in Settings → Plans & credits.");
      throw new Error("The assistant had a problem. Please try again.");
    }
    if (!reply) reply = "Sorry, I couldn't produce an answer.";
    const next = [...msgs, { role: "assistant" as const, content: reply, at: new Date().toISOString() }];
    const title = row.title === "New case" ? data.message.replace(/\s+/g, " ").slice(0, 60) : row.title;
    const { error: uErr } = await sb.from("support_cases")
      .update({ messages: next, title, account_id: accountId, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { messages: next as CopilotMessage[], accountId };
  });

export const runCopilotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ caseId: z.string().uuid(), action: z.enum(["resume_campaign", "lift_hold"]), target: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const sb = await admin();
    const { data: row } = await sb.from("support_cases").select("account_id").eq("id", data.caseId).maybeSingle();
    if (!row?.account_id) throw new Error("Link the tenant to this case first.");
    if (data.action === "lift_hold") {
      if (data.target !== row.account_id) throw new Error("That account isn't the tenant on this case.");
      const { resumeTenantSending } = await import("./tenant-suspension.server");
      await resumeTenantSending({ tenantAccountId: data.target, liftedBy: context.userId });
      return { ok: true, message: "Sending hold lifted." };
    }
    const { data: c, error } = await sb.from("campaigns").select("id, status, account_id").eq("id", data.target).maybeSingle();
    if (error) throw new Error(error.message);
    if (!c || c.account_id !== row.account_id) throw new Error("Campaign not found for this tenant.");
    if (!["paused", "paused_by_user"].includes(c.status)) throw new Error(`Campaign is "${c.status}", not paused.`);
    const { error: uErr } = await sb.from("campaigns").update({ status: "sending", paused_reason: null, paused_at: null }).eq("id", c.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, message: "Campaign resumed." };
  });
