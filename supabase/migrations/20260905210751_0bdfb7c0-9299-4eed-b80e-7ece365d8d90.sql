-- These were still reachable through the blanket PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.admin_finance_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_finance_tenants() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.try_acquire_dispatch_lock(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_dispatch_lock(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_dispatch_lock(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_dispatch_lock(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_message_status_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_message_status_batch(jsonb) TO service_role;

-- Trigger-only functions never need to be callable from the API.
REVOKE EXECUTE ON FUNCTION public.record_unroutable_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sender_assets_protect_local_verified() FROM PUBLIC;