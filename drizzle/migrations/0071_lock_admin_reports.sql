REVOKE EXECUTE ON FUNCTION public.admin_campaign_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_margin_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_margin_audit() TO service_role;