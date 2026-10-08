import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminDb(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
  return supabaseAdmin;
}

export const adminListApiAccessRequests = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await adminDb(context.userId);
  const { data, error } = await db.from("api_access_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map((r) => r.account_id))];
  const { data: accts } = ids.length ? await db.from("accounts").select("id,email").in("id", ids) : { data: [] as { id: string; email: string | null }[] };
  const emails = new Map((accts ?? []).map((a) => [a.id, a.email]));
  return (data ?? []).map((r) => ({ ...r, account_email: emails.get(r.account_id) ?? null }));
});

export const adminReviewApiAccessRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["approved", "rejected", "revoked"]), note: z.string().trim().max(1000).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.userId);
    const { error } = await db.from("api_access_requests").update({ status: data.status, admin_note: data.note || null, reviewed_by: context.userId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
