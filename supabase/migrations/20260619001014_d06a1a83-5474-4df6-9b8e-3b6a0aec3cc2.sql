
-- 1) sender_assets INSERT: tenant cannot self-approve
DROP POLICY IF EXISTS "tenant writes own sender assets" ON public.sender_assets;
CREATE POLICY "tenant writes own sender assets"
ON public.sender_assets
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin')
  OR (account_id = auth.uid() AND verification_status = 'pending')
);

-- 2) accounts: revoke client access to Twilio credential columns (server uses service_role)
REVOKE SELECT (
  twilio_subaccount_sid,
  twilio_subaccount_auth_token_enc,
  subaccount_phone_sid,
  subaccount_messaging_service_sid,
  subaccount_phone_number
) ON public.accounts FROM authenticated, anon;

REVOKE UPDATE (
  twilio_subaccount_sid,
  twilio_subaccount_auth_token_enc,
  subaccount_phone_sid,
  subaccount_messaging_service_sid,
  subaccount_phone_number
) ON public.accounts FROM authenticated, anon;

-- 3) storage payment-proofs: restrict DELETE/UPDATE to authenticated
DROP POLICY IF EXISTS "tenants delete own payment proofs" ON storage.objects;
CREATE POLICY "tenants delete own payment proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "tenants update own payment proofs" ON storage.objects;
CREATE POLICY "tenants update own payment proofs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
