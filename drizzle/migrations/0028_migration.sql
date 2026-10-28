CREATE TABLE public.tenant_twilio_lines (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  subaccount_sid text UNIQUE,
  auth_token_enc bytea,
  phone_number text UNIQUE,
  phone_sid text,
  verification_sid text,
  status text NOT NULL DEFAULT 'requested',
  status_detail text,
  monthly_fee_usd numeric NOT NULL DEFAULT 5,
  charged_at timestamptz,
  renews_at timestamptz,
  billing_status text NOT NULL DEFAULT 'current',
  last_renewal_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_twilio_lines TO authenticated;
GRANT ALL ON public.tenant_twilio_lines TO service_role;
ALTER TABLE public.tenant_twilio_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own line" ON public.tenant_twilio_lines FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR EXISTS (SELECT 1 FROM public.account_members m WHERE m.account_id = tenant_twilio_lines.account_id AND m.user_id = auth.uid()));
REVOKE SELECT (auth_token_enc) ON public.tenant_twilio_lines FROM authenticated;

INSERT INTO public.platform_settings(key, value) VALUES ('twilio_line_monthly_usd', '5') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.charge_twilio_line_renewals()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; charged integer := 0;
BEGIN
  FOR r IN SELECT account_id, phone_number, monthly_fee_usd, renews_at FROM public.tenant_twilio_lines
    WHERE phone_number IS NOT NULL AND renews_at IS NOT NULL AND renews_at <= now() AND status <> 'released'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.debit_account(r.account_id, r.monthly_fee_usd, NULL, 'Dedicated toll-free number ' || r.phone_number || ' — monthly renewal');
      UPDATE public.tenant_twilio_lines SET charged_at = now(), renews_at = r.renews_at + interval '1 month',
        billing_status = 'current', last_renewal_error = NULL, updated_at = now() WHERE account_id = r.account_id;
      charged := charged + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.tenant_twilio_lines SET billing_status = 'past_due', last_renewal_error = SQLERRM, updated_at = now()
        WHERE account_id = r.account_id;
    END;
  END LOOP;
  RETURN charged;
END $$;
REVOKE ALL ON FUNCTION public.charge_twilio_line_renewals() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('charge-twilio-line-renewals', '17 * * * *', $$SELECT public.charge_twilio_line_renewals()$$);