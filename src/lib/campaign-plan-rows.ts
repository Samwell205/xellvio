// Campaign planning writes queued and skipped recipients in one bulk upsert.
// PostgREST builds the column list from the union of keys across the batch and
// fills any key a row is missing with NULL (defaultToNull), so a row that omits
// a column its siblings carry breaks that column's NOT NULL rule and the whole
// chunk is rejected — which would stop the campaign for everyone. Every
// planning row is therefore built here so the shapes cannot drift apart.

export type CampaignPlanRow = {
  id: string;
  campaign_id: string;
  profile_id: string | null;
  phone_e164: string;
  country_code: string | null;
  segments_count: number;
  is_mms: boolean;
  cost: number;
  rendered_body: string;
};

export type CampaignPlanRowInput = {
  messageId: string;
  campaignId: string;
  profileId: string | null;
  phoneE164: string;
  countryCode: string | null;
  segmentsCount: number;
  isMms: boolean;
  cost: number;
  renderedBody: string;
};

export function buildCampaignPlanRow(input: CampaignPlanRowInput): CampaignPlanRow {
  return {
    id: input.messageId,
    campaign_id: input.campaignId,
    profile_id: input.profileId,
    phone_e164: input.phoneE164,
    country_code: input.countryCode,
    // MMS is a single message, not N SMS segments.
    segments_count: input.segmentsCount,
    is_mms: input.isMms,
    cost: input.cost,
    rendered_body: input.renderedBody,
  };
}

export type PersonalizationBlockedRowInput = {
  messageId: string;
  campaignId: string;
  profileId: string | null;
  phoneE164: string;
  countryCode: string | null;
  segmentsCount: number;
  renderedBody: string;
};

export type PersonalizationBlockedPatch = {
  status: string;
  error_code: string;
  failure_reason: string;
};

export type CampaignPlanBlockedRow = CampaignPlanRow & PersonalizationBlockedPatch;

export function buildPersonalizationBlockedRow(
  input: PersonalizationBlockedRowInput,
  patch: PersonalizationBlockedPatch,
): CampaignPlanBlockedRow {
  return {
    ...buildCampaignPlanRow({
      messageId: input.messageId,
      campaignId: input.campaignId,
      profileId: input.profileId,
      phoneE164: input.phoneE164,
      countryCode: input.countryCode,
      segmentsCount: input.segmentsCount,
      // Nothing reached the carrier, so this is not an MMS.
      isMms: false,
      // Flagged contacts are skipped before any charge is taken.
      cost: 0,
      renderedBody: input.renderedBody,
    }),
    ...patch,
  };
}
