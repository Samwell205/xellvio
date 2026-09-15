import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const screenPhoneLineTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        listId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(5000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { screenLineTypesForUser } = await import("./line-type.server");
    return screenLineTypesForUser(context.userId, { listId: data.listId ?? null, limit: data.limit });
  });

export const getPhoneLineTypeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getLineTypeStatsForUser } = await import("./line-type.server");
    return getLineTypeStatsForUser(context.userId);
  });
