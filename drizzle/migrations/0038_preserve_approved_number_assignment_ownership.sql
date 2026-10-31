ALTER TABLE public.tenant_twilio_lines DROP CONSTRAINT IF EXISTS tenant_twilio_lines_subaccount_sid_key;
ALTER TABLE public.tenant_twilio_lines DROP CONSTRAINT IF EXISTS tenant_twilio_lines_phone_number_key;
CREATE INDEX IF NOT EXISTS tenant_twilio_lines_subaccount_lookup_idx ON public.tenant_twilio_lines (subaccount_sid);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_twilio_lines_owned_phone_number_key ON public.tenant_twilio_lines (phone_number) WHERE status <> 'released' AND phone_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_twilio_lines_owned_phone_sid_key ON public.tenant_twilio_lines (phone_sid) WHERE status <> 'released' AND phone_sid IS NOT NULL;
COMMENT ON INDEX public.tenant_twilio_lines_subaccount_lookup_idx IS 'Approved numbers remain in their existing carrier account; business ownership is exclusive per unreleased number, not per carrier account.';
COMMENT ON INDEX public.tenant_twilio_lines_owned_phone_number_key IS 'Released historical lines do not reserve a number; every unreleased number belongs to only one business.';