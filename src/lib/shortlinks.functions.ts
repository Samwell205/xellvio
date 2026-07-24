import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActingAccount } from "@/lib/acting-account.server";

const SHORT_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function shortCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += SHORT_ALPHABET[bytes[i] % SHORT_ALPHABET.length];
  return out;
}

function publicBaseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://xellvio.com";
  return raw.replace(/\/+$/, "");
}

/** Create a shortlink usable in the campaign builder before dispatch.
 * Returns { code, shortUrl } — inject shortUrl into the message body. */
export const createPreviewShortlink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      url: z.string().url().max(2048),
      campaignId: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const acting = await resolveActingAccount(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = shortCode(8);
      const { error } = await supabaseAdmin.from("link_clicks").insert({
        short_code: code,
        url: data.url,
        account_id: acting.accountId,
        campaign_id: data.campaignId ?? null,
        message_id: null,
      } as any);
      if (!error) return { code, shortUrl: `${publicBaseUrl()}/r/${code}` };
      // 23505 unique_violation → retry with a fresh code
      if ((error as any).code !== "23505") throw new Error(error.message);
    }
    throw new Error("Could not generate a unique shortlink, please try again.");
  });
