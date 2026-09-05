-- 1. Stop anonymous visitors enumerating every certified learner's enrollment row.
DROP POLICY IF EXISTS "Anyone can verify certificate by code" ON public.academy_enrollments;
REVOKE SELECT ON public.academy_enrollments FROM anon;

-- 2. Limit workspace API key rows (hash + prefix) to admin-level members / owner.
DROP POLICY IF EXISTS "members read own workspace keys" ON public.workspace_api_keys;
CREATE POLICY "admins read own workspace keys"
ON public.workspace_api_keys
FOR SELECT
TO authenticated
USING (public.has_account_access(account_id, 'admin'::account_member_role));

-- 3. Privileged SECURITY DEFINER helpers must not be callable without signing in.
REVOKE EXECUTE ON FUNCTION public.admin_finance_tenants() FROM anon;
REVOKE EXECUTE ON FUNCTION public.campaign_report_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_import_profiles(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_contact_list(uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_message_status_batch(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.try_acquire_dispatch_lock(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_dispatch_lock(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_unroutable_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_domain_filter_stats(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_link_click(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sender_assets_protect_local_verified() FROM anon;