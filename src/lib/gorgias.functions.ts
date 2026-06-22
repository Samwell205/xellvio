import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SaveSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((s) => s.replace(/^https?:\/\//, "").replace(/\.gorgias\.com.*$/i, "").replace(/\/.*$/, ""))
    .refine((s) => /^[a-zA-Z0-9][a-zA-Z0-9-]{1,62}$/.test(s), {
      message: "Subdomain should be just the part before .gorgias.com (letters, numbers, hyphens) — e.g. 'mybrand' from mybrand.gorgias.com",
    }),
  email: z.string().trim().email().max(200),
  apiKey: z.string().trim().max(500).optional().transform((s) => (s ? s : undefined)),
  enabled: z.boolean().optional(),
});

export const getGorgiasSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("accounts")
      .select("gorgias_enabled,gorgias_domain,gorgias_email,gorgias_api_key_enc")
      .eq("id", userId)
      .maybeSingle();
    return {
      enabled: !!data?.gorgias_enabled,
      domain: data?.gorgias_domain ?? "",
      email: data?.gorgias_email ?? "",
      hasApiKey: !!data?.gorgias_api_key_enc,
    };
  });

export const saveGorgiasSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { encryptToken, decryptToken } = await import("./tenant-crypto.server");
    const { verifyGorgias } = await import("./gorgias.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If the user didn't paste a new API key, reuse the saved one.
    let apiKey = data.apiKey;
    if (!apiKey) {
      const { data: existing } = await supabase
        .from("accounts")
        .select("gorgias_api_key_enc")
        .eq("id", userId)
        .maybeSingle();
      const enc = existing?.gorgias_api_key_enc as string | null | undefined;
      if (!enc) throw new Error("Paste your Gorgias API key to connect.");
      apiKey = decryptToken(enc);
    }

    // Verify creds against Gorgias before saving so we never store a broken key.
    await verifyGorgias({ domain: data.domain, email: data.email, apiKey });

    const enc = encryptToken(apiKey);
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({
        gorgias_domain: data.domain,
        gorgias_email: data.email,
        gorgias_api_key_enc: enc,
        gorgias_enabled: data.enabled ?? true,
      })
      .eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const disableGorgias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("accounts")
      .update({ gorgias_enabled: false })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
