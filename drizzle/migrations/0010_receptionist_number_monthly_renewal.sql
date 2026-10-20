ALTER TABLE public.receptionist_settings
  ADD COLUMN IF NOT EXISTS number_renews_at timestamptz,
  ADD COLUMN IF NOT EXISTS number_billing_status text NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS number_last_renewal_error text;

UPDATE public.receptionist_settings
  SET number_renews_at = number_charged_at + interval '1 month'
  WHERE voice_number IS NOT NULL AND number_charged_at IS NOT NULL AND number_renews_at IS NULL;

CREATE OR REPLACE FUNCTION public.charge_receptionist_number_renewals()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  price numeric;
  charged integer := 0;
BEGIN
  SELECT COALESCE((configuration->>'numberMonthlyUsd')::numeric, 5) INTO price
    FROM public.receptionist_platform_settings WHERE id = true;
  price := COALESCE(price, 5);
  FOR r IN
    SELECT account_id, voice_number, number_renews_at FROM public.receptionist_settings
    WHERE voice_number IS NOT NULL AND number_renews_at IS NOT NULL AND number_renews_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.debit_account(r.account_id, price, NULL, 'Calling number ' || r.voice_number || ' — monthly renewal');
      UPDATE public.receptionist_settings
        SET number_charged_at = now(),
            number_renews_at = r.number_renews_at + interval '1 month',
            number_billing_status = 'current',
            number_last_renewal_error = NULL,
            updated_at = now()
        WHERE account_id = r.account_id;
      charged := charged + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.receptionist_settings
        SET number_billing_status = 'past_due',
            number_last_renewal_error = SQLERRM,
            updated_at = now()
        WHERE account_id = r.account_id;
    END;
  END LOOP;
  RETURN charged;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_receptionist_number_renewals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_receptionist_number_renewals() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('receptionist-number-renewals', '15 * * * *', $$SELECT public.charge_receptionist_number_renewals();$$);