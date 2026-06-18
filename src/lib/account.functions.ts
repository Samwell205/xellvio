import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const email = user?.email ?? null;
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      "";

    const { data: existing, error: lookupError } = await supabase
      .from("accounts")
      .select("id,email,contact_email,full_name")
      .eq("id", userId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!existing) {
      const { error } = await supabase.from("accounts").insert({
        id: userId,
        email,
        contact_email: email,
        full_name: fullName,
      });
      if (error) throw error;
      return { created: true };
    }

    const patch: { email?: string; contact_email?: string; full_name?: string } = {};
    if (!existing.email && email) patch.email = email;
    if (!existing.contact_email && email) patch.contact_email = email;
    if (!existing.full_name && fullName) patch.full_name = fullName;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("accounts").update(patch).eq("id", userId);
      if (error) throw error;
    }
    return { created: false };
  });