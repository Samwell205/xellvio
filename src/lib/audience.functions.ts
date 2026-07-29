import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getAudienceListCountsForUser,
  getAudienceStatsForUser,
  listAudienceContactListsForUser,
  listAudienceProfilesForUser,
} from "./audience.server";

export const listAudienceContactLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listAudienceContactListsForUser(context.userId));

export const listAudienceProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ listId: z.string().uuid().nullable().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => listAudienceProfilesForUser(context.userId, data.listId ?? null));

export const getAudienceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getAudienceStatsForUser(context.userId));

export const getAudienceListCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getAudienceListCountsForUser(context.userId));