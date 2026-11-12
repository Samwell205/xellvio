import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startShopifyConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shop: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { normalizeShop, buildInstallUrl } = await import("./oauth.server");
    const origin = new URL(getRequest().url).origin;
    return { url: await buildInstallUrl(origin, context.userId, normalizeShop(data.shop)) };
  });
