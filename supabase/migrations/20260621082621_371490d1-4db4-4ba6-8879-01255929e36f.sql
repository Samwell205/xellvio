GRANT SELECT (sms_consent_disclosures_confirmed_at, sms_consent_disclosures_version)
  ON public.accounts
  TO authenticated;

GRANT UPDATE (sms_consent_disclosures_confirmed_at, sms_consent_disclosures_version)
  ON public.accounts
  TO authenticated;