
CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  unconfirmed bigint,
  queued bigint,
  cost numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric
  FROM public.messages m
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;
