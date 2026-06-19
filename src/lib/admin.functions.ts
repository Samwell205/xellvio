import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _role: "admin" });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Forbidden: admin only");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: accounts, error } = await supabaseAdmin
      .from("accounts")
      .select("id,email,full_name,company,created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id,role");
    if (rolesError) throw new Error(rolesError.message);
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as string);
      roleMap.set(r.user_id, arr);
    }
    return (accounts ?? []).map((a) => ({
      ...a,
      roles: roleMap.get(a.id) ?? [],
      is_admin: (roleMap.get(a.id) ?? []).includes("admin"),
    }));
  });

const setRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "user"]),
  grant: z.boolean(),
});

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Safety: prevent admin from revoking their own admin role (avoid lockout)
    if (data.role === "admin" && !data.grant && data.user_id === context.userId) {
      throw new Error("You cannot remove your own admin role.");
    }

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (error && !error.message.includes("duplicate key")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
