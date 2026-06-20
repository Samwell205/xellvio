
-- 1) Hide encrypted Twilio subaccount auth token from tenant SELECTs (defense-in-depth)
REVOKE SELECT (twilio_subaccount_auth_token_enc) ON public.accounts FROM authenticated;
REVOKE SELECT (twilio_subaccount_auth_token_enc) ON public.accounts FROM anon;

-- 2) Explicit RESTRICTIVE deny on billing_settings for non-admins (makes intent unambiguous)
DROP POLICY IF EXISTS "billing_settings non-admin deny" ON public.billing_settings;
CREATE POLICY "billing_settings non-admin deny"
ON public.billing_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

-- 3) Lock down SECURITY DEFINER crypto helpers (must not be callable by tenants)
REVOKE EXECUTE ON FUNCTION public.encrypt_twilio_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_twilio_token(bytea) FROM PUBLIC, anon, authenticated;

-- 4) Pin search_path on the email queue wrapper functions (linter: function_search_path_mutable)
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
