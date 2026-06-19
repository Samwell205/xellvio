
-- 1) Restrict sensitive Twilio columns: revoke from authenticated; service_role retains via GRANT ALL
REVOKE SELECT (twilio_subaccount_sid, twilio_subaccount_auth_token_enc, subaccount_phone_sid, subaccount_messaging_service_sid)
  ON public.accounts FROM authenticated;
REVOKE UPDATE (twilio_subaccount_sid, twilio_subaccount_auth_token_enc, subaccount_phone_sid, subaccount_messaging_service_sid)
  ON public.accounts FROM authenticated;

-- 2) Tighten sender_assets UPDATE policy: pin current verification_status to 'pending' for non-admins
DROP POLICY IF EXISTS "tenant updates own sender assets" ON public.sender_assets;
CREATE POLICY "tenant updates own sender assets"
ON public.sender_assets
FOR UPDATE
TO authenticated
USING (
  public.has_role('admin') OR (account_id = auth.uid() AND verification_status = 'pending')
)
WITH CHECK (
  public.has_role('admin') OR (account_id = auth.uid() AND verification_status = 'pending')
);

-- 3) Add explicit admin-only DELETE policy on accounts (prevents accidental future broadening; no self-delete)
CREATE POLICY "admins can delete accounts"
ON public.accounts
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

-- 4) Tighten contact_messages INSERT policy: keep public submissions but add basic validation
DROP POLICY IF EXISTS "anyone can submit a contact message" ON public.contact_messages;
CREATE POLICY "anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(coalesce(name, '')) BETWEEN 1 AND 200
  AND char_length(coalesce(email, '')) BETWEEN 3 AND 320
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND char_length(coalesce(message, '')) BETWEEN 1 AND 5000
);
