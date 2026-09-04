// Admin-only: assign a branded click domain to a tenant so tracked short
// links are built on their own domain instead of the shared xellvio.com/r/…
// path (shared domains inherit other tenants' carrier reputation).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  accountId: z.string().uuid(),
  // Empty string clears it and falls back to the shared platform domain.
  domain: z.string().trim().max(253),
});

export const adminSetClickDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (roleErr || isAdmin !== true) throw new Error("Forbidden");

    const { normalizeClickDomain, defaultClickBase } = await import("./click-domain.server");
    const host = normalizeClickDomain(data.domain);
    if (data.domain.trim() && !host) {
      throw new Error("Enter a valid domain, e.g. links.yourbrand.com");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({ click_domain: host } as never)
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);

    return {
      clickBase: host ? `https://${host}` : defaultClickBase(),
      branded: !!host,
    };
  });
