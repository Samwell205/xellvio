import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const makeMeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" })
      .select()
      .single();
    if (error) {
      if (error.message.includes("duplicate key")) {
        return { ok: true, alreadyAdmin: true };
      }
      throw new Error(error.message);
    }
    return { ok: true, alreadyAdmin: false };
  });
