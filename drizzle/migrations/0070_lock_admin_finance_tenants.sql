REVOKE EXECUTE ON FUNCTION public.admin_finance_tenants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_tenants() TO service_role;