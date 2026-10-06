ALTER FUNCTION public.admin_finance_summary() SET statement_timeout = '120s';
ALTER FUNCTION public.admin_finance_daily(integer) SET statement_timeout = '120s';
ALTER FUNCTION public.admin_finance_tenants() SET statement_timeout = '120s';
CREATE OR REPLACE FUNCTION public.admin_attempt_audit()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '120s' AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin_or_service() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'total_attempts', count(*),
    'tenant_charges', COALESCE(sum(tenant_charge),0),
    'carrier_cost', COALESCE(sum(estimated_carrier_cost),0),
    'retry_attempts', count(*) FILTER (WHERE COALESCE(attempt_number,1) > 1),
    'retry_charges', COALESCE(sum(tenant_charge) FILTER (WHERE COALESCE(attempt_number,1) > 1),0),
    'retry_carrier_cost', COALESCE(sum(estimated_carrier_cost) FILTER (WHERE COALESCE(attempt_number,1) > 1),0)
  ) INTO r FROM message_send_attempts;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_attempt_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attempt_audit() TO service_role;