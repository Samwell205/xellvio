import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getCampaignAudienceCountryCountsForUser,
  getAudienceListCountsForUser,
  getAudienceStatsForUser,
  listAudienceContactListsForUser,
  listAudienceProfilesForUser,
} from "./audience.server";

const CampaignAudienceSchema = z.object({
  include: z.array(z.string().uuid()).default([]),
  exclude: z.array(z.string().uuid()).default([]),
  profile_ids: z.array(z.string().uuid()).default([]),
  list_ids: z.array(z.string().uuid()).default([]),
});

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

export const getCampaignAudienceCountryCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CampaignAudienceSchema.parse(input))
  .handler(async ({ data, context }) => getCampaignAudienceCountryCountsForUser(context.userId, data));