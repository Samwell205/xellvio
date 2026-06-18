
REVOKE EXECUTE ON FUNCTION public.topup_account(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_account(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_twilio_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_twilio_token(bytea) FROM PUBLIC, anon, authenticated;
