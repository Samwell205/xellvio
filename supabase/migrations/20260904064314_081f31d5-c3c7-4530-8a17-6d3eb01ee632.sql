CREATE OR REPLACE FUNCTION public.link_domain_filter_stats(_domains text[])
RETURNS TABLE(domain text, total bigint, filtered bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ext AS (
    SELECT lower((regexp_matches(m.rendered_body, 'https?://([A-Za-z0-9.-]+)', 'g'))[1]) AS d,
           m.error_code
    FROM public.messages m
    WHERE m.created_at > now() - interval '30 days'
      AND m.rendered_body LIKE '%http%'
      AND m.status IN ('delivered','failed','undelivered','sent','accepted')
  )
  SELECT e.d AS domain,
         count(*) AS total,
         count(*) FILTER (WHERE e.error_code = '40002') AS filtered
  FROM ext e
  WHERE e.d = ANY (SELECT lower(x) FROM unnest(_domains) x)
  GROUP BY e.d
$$;

REVOKE ALL ON FUNCTION public.link_domain_filter_stats(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_domain_filter_stats(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_domain_filter_stats(text[]) TO authenticated;