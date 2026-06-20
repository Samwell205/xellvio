ALTER TABLE public.accounts DISABLE TRIGGER USER;
UPDATE public.accounts SET twilio_subaccount_sid = NULL, twilio_subaccount_auth_token_enc = NULL WHERE twilio_subaccount_sid IS NOT NULL;
ALTER TABLE public.accounts ENABLE TRIGGER USER;