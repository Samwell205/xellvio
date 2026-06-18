
-- Revoke client write privileges; service_role retains ALL via existing grants
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.notifications FROM authenticated, anon;

-- Explicit deny policies for authenticated role (defense in depth)
CREATE POLICY "tx no client insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "tx no client update" ON public.transactions FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "tx no client delete" ON public.transactions FOR DELETE TO authenticated USING (false);

CREATE POLICY "wallet no client insert" ON public.wallets FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "wallet no client update" ON public.wallets FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "wallet no client delete" ON public.wallets FOR DELETE TO authenticated USING (false);

CREATE POLICY "roles no client insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "roles no client update" ON public.user_roles FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "roles no client delete" ON public.user_roles FOR DELETE TO authenticated USING (false);

CREATE POLICY "notif no client insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "notif no client delete" ON public.notifications FOR DELETE TO authenticated USING (false);
