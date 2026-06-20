ALTER VIEW public.country_rates_public SET (security_invoker = true);

ALTER TABLE public.email_send_state FORCE ROW LEVEL SECURITY;
CREATE POLICY "Deny non-service_role access to email_send_state"
  ON public.email_send_state
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);