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

/** Screen explicit phone numbers, e.g. straight from a CSV upload. */
export const screenImportedPhones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phones: z.array(z.string()).min(1).max(2000) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { screenExplicitPhonesForUser } = await import("./line-type.server");
    return screenExplicitPhonesForUser(context.userId, data.phones);
  });

export const getUploadScreeningSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getUploadScreeningSettingForUser } = await import("./line-type.server");
    return getUploadScreeningSettingForUser(context.userId);
  });

export const saveUploadScreeningSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { saveUploadScreeningSettingForUser } = await import("./line-type.server");
    return saveUploadScreeningSettingForUser(context.userId, data.enabled);
  });
