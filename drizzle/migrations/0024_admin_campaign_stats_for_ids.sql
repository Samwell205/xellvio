CREATE INDEX IF NOT EXISTS messages_campaign_id_idx ON public.messages (campaign_id);
CREATE OR REPLACE FUNCTION public.admin_campaign_stats_for(_ids uuid[])
 RETURNS TABLE(campaign_id uuid, total bigint, delivered bigint, failed bigint, sent bigint, delivery_unconfirmed bigint, queued bigint, tenant_cost numeric, reserved_cost numeric, telnyx_cost numeric, segments bigint, mms_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '55s'
AS $function$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost) FILTER (WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')),0)::numeric,
    coalesce(sum(m.cost) FILTER (WHERE m.status IN ('queued','sending','pending')),0)::numeric,
    coalesce(sum(
      (COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0))
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ) FILTER (WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  CROSS JOIN (SELECT 1 WHERE public.is_admin_or_service()) AS guard
  WHERE m.campaign_id = ANY(_ids)
  GROUP BY m.campaign_id;
$function$;
REVOKE ALL ON FUNCTION public.admin_campaign_stats_for(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats_for(uuid[]) TO service_role;