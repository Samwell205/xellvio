
-- 1) Track whether a message was sent as MMS (has media). Backfill from campaign.media_url.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_mms boolean NOT NULL DEFAULT false;

UPDATE public.messages m
SET is_mms = true
FROM public.campaigns c
WHERE m.campaign_id = c.id
  AND c.media_url IS NOT NULL
  AND m.is_mms = false;

CREATE INDEX IF NOT EXISTS idx_messages_is_mms ON public.messages(is_mms) WHERE is_mms = true;

-- 2) Fix admin_campaign_stats: apply mms_multiplier to carrier_cost when message is MMS.
DROP FUNCTION IF EXISTS public.admin_campaign_stats();
CREATE FUNCTION public.admin_campaign_stats()
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  unconfirmed bigint,
  queued bigint,
  cost numeric,
  carrier_cost numeric,
  segments bigint,
  mms_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(
      COALESCE(cr.cost_price,0)
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;
REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;
