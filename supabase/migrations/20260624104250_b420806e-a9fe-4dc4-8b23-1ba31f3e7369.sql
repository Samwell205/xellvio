
REVOKE EXECUTE ON FUNCTION public.has_account_access(uuid, public.account_member_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_account_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_account_access(uuid, public.account_member_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_invites() TO authenticated, service_role;
