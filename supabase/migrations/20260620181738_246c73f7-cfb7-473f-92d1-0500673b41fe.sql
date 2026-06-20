
-- Lock down internal SECURITY DEFINER functions: triggers and server-only helpers
-- should not be callable by anon or authenticated roles via the Data API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_tollfree_verification_attempts_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sender_assets_block_tenant_carrier_writes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_sender_asset_from_number_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounts_block_sensitive_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.topup_account(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_account(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
