
CREATE OR REPLACE FUNCTION public.get_acting_account_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT m.account_id FROM public.account_members m
      WHERE m.user_id = _user_id AND m.status = 'active'
      ORDER BY m.accepted_at ASC NULLS LAST, m.created_at ASC LIMIT 1),
    _user_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_acting_account_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_workspace_permission(_owner_account_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _owner_account_id = auth.uid() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.account_members m
      WHERE m.account_id = _owner_account_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND (m.role = 'admin' OR COALESCE((m.permissions ->> _key)::boolean, false) = true)
    )
  END
$$;
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Team editors can write campaigns" ON public.campaigns;
CREATE POLICY "Team editors can write campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write profiles" ON public.profiles;
CREATE POLICY "Team editors can write profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write contact_lists" ON public.contact_lists;
CREATE POLICY "Team editors can write contact_lists" ON public.contact_lists FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write profile_list_members" ON public.profile_list_members;
CREATE POLICY "Team editors can write profile_list_members" ON public.profile_list_members FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write segments" ON public.segments;
CREATE POLICY "Team editors can write segments" ON public.segments FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write suppressions" ON public.suppressions;
CREATE POLICY "Team editors can write suppressions" ON public.suppressions FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write consents" ON public.consents;
CREATE POLICY "Team editors can write consents" ON public.consents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND public.has_account_access(p.account_id, 'editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND public.has_account_access(p.account_id, 'editor')));

DROP POLICY IF EXISTS "Team editors can write sender_assets" ON public.sender_assets;
CREATE POLICY "Team editors can write sender_assets" ON public.sender_assets FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write sms_thread_messages" ON public.sms_thread_messages;
CREATE POLICY "Team editors can write sms_thread_messages" ON public.sms_thread_messages FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write tenant_10dlc_registrations" ON public.tenant_10dlc_registrations;
CREATE POLICY "Team editors can write tenant_10dlc_registrations" ON public.tenant_10dlc_registrations FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can write tollfree_verification_attempts" ON public.tollfree_verification_attempts;
CREATE POLICY "Team editors can write tollfree_verification_attempts" ON public.tollfree_verification_attempts FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'editor'))
  WITH CHECK (public.has_account_access(account_id, 'editor'));

DROP POLICY IF EXISTS "Team editors can create number_requests" ON public.number_requests;
CREATE POLICY "Team editors can create number_requests" ON public.number_requests FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(account_id, 'editor'));
