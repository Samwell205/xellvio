
-- Restrictive policies to deny non-service_role access on sensitive log/token tables
CREATE POLICY "Service role only access" ON public.email_send_log
  AS RESTRICTIVE FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only access" ON public.email_unsubscribe_tokens
  AS RESTRICTIVE FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only access" ON public.suppressed_emails
  AS RESTRICTIVE FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
