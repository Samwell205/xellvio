GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pricing_sync_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.pricing_sync_log;
  END IF;
END $$;

DROP POLICY IF EXISTS "credit_tx admin read" ON public.credit_transactions;
CREATE POLICY "credit_tx admin read"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

REVOKE SELECT (twilio_subaccount_sid, subaccount_phone_sid, subaccount_messaging_service_sid)
  ON public.accounts
  FROM authenticated, anon;