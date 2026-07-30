CREATE OR REPLACE FUNCTION public.campaign_report_summary(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _account_id uuid;
  res jsonb;
BEGIN
  SELECT c.account_id INTO _account_id FROM public.campaigns c WHERE c.id = _campaign_id;
  IF _account_id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF NOT (public.is_admin_or_service() OR public.has_account_access(_account_id, 'viewer')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH m AS (
    SELECT * FROM public.messages WHERE campaign_id = _campaign_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM m),
    'queued', (SELECT count(*) FROM m WHERE status IN ('queued','pending')),
    'sending', (SELECT count(*) FROM m WHERE status = 'sending'),
    'sent', (SELECT count(*) FROM m WHERE status = 'sent' AND error_code IS NULL),
    'sent_with_error', (SELECT count(*) FROM m WHERE status = 'sent' AND error_code IS NOT NULL),
    'delivered', (SELECT count(*) FROM m WHERE status = 'delivered'),
    'delivery_unconfirmed', (SELECT count(*) FROM m WHERE status = 'delivery_unconfirmed'),
    'failed', (SELECT count(*) FROM m WHERE status IN ('failed','undelivered')),
    'segments', (SELECT COALESCE(sum(COALESCE(segments_count,1)),0) FROM m),
    'mms_count', (SELECT count(*) FROM m WHERE is_mms),
    'billed_cost', (SELECT COALESCE(sum(cost),0) FROM m WHERE status IN ('sent','delivered','delivery_unconfirmed','undelivered')),
    'reserved_cost', (SELECT COALESCE(sum(cost),0) FROM m WHERE status IN ('queued','sending','pending')),
    'first_created_at', (SELECT min(created_at) FROM m),
    'last_activity_at', (SELECT max(GREATEST(COALESCE(delivered_at, created_at), COALESCE(sent_at, created_at), created_at)) FROM m),
    'by_country', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.messages DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(country_code,'??') AS country,
               count(*)::bigint AS messages,
               count(*) FILTER (WHERE status = 'delivered')::bigint AS delivered,
               count(*) FILTER (WHERE status IN ('failed','undelivered'))::bigint AS failed,
               COALESCE(sum(COALESCE(segments_count,1)),0)::bigint AS segments,
               COALESCE(sum(cost),0)::numeric AS cost
        FROM m GROUP BY 1
      ) x
    ),
    'by_failure_reason', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.count DESC), '[]'::jsonb) FROM (
        SELECT COALESCE(error_code,'unknown') AS error_code,
               max(failure_reason) AS failure_reason,
               count(*)::bigint AS count
        FROM m WHERE status IN ('failed','undelivered') OR (status = 'sent' AND error_code IS NOT NULL)
        GROUP BY 1
      ) x
    ),
    'failures_by_country', (
      SELECT COALESCE(jsonb_object_agg(country, cnt), '{}'::jsonb) FROM (
        SELECT COALESCE(country_code,'—') AS country, count(*)::bigint AS cnt
        FROM m WHERE status IN ('failed','undelivered') GROUP BY 1
      ) y
    )
  ) INTO res;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_report_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_report_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_report_summary(uuid) TO service_role;