-- 1. Pin search_path on functions that lack it (0011_function_search_path_mutable)
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.shared_tollfree_pool_touch() SET search_path = public;

-- 2. admin_campaign_stats is SECURITY DEFINER but had no role check of its own.
--    Add the same admin guard used by the other admin_* finance reports.
CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
 RETURNS TABLE(campaign_id uuid, total bigint, delivered bigint, failed bigint, sent bigint, delivery_unconfirmed bigint, queued bigint, tenant_cost numeric, telnyx_cost numeric, segments bigint, mms_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  CROSS JOIN (SELECT 1 WHERE public.has_role('admin')) AS guard
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$function$;

-- 3. Revoke anonymous/PUBLIC EXECUTE on SECURITY DEFINER functions
--    (0028_anon_security_definer_function_executable)

-- 3a. Internal trigger helpers: never called directly by any client.
--     Trigger execution does not require EXECUTE on the invoking role.
REVOKE ALL ON FUNCTION public.accounts_block_sensitive_self_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared_tollfree_pool_touch() FROM PUBLIC, anon, authenticated;

-- 3b. Admin-only reporting functions: signed-in callers only, guarded internally by has_role('admin').
REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finance_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finance_tenants() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finance_daily(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_tenants() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_daily(integer) TO authenticated, service_role;

-- 3c. Tenant helpers used by RLS policies: required by signed-in users only.
--     No anon-facing policy references these (verified against pg_policy).
REVOKE ALL ON FUNCTION public.get_acting_account_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_permission(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_acting_account_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, text) TO authenticated, service_role;

-- 4. country_rates: internal cost_price / markup_percent must never be reachable
--    by signed-out callers. anon currently holds INSERT/UPDATE/DELETE/TRUNCATE
--    grants (blocked only by absence of a matching policy) - remove them entirely.
REVOKE ALL ON TABLE public.country_rates FROM anon;

-- Keep the admin UI working (reads + rate edits) but drop unused privileges.
REVOKE ALL ON TABLE public.country_rates FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.country_rates TO authenticated;
GRANT ALL ON TABLE public.country_rates TO service_role;

-- The read policy applied to every role (including anon); scope it to signed-in admins.
DROP POLICY IF EXISTS "country_rates admin read" ON public.country_rates;
CREATE POLICY "country_rates admin read"
  ON public.country_rates
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));