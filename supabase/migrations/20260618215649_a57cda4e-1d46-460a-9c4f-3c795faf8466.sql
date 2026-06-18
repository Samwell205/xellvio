
CREATE TABLE public.contact_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage contact lists"
  ON public.contact_lists FOR ALL
  USING (account_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (account_id = auth.uid() OR public.has_role('admin'));

CREATE TRIGGER touch_contact_lists_updated_at
  BEFORE UPDATE ON public.contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Join table: profiles <-> lists
CREATE TABLE public.profile_list_members (
  list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, profile_id)
);

CREATE INDEX profile_list_members_profile_idx ON public.profile_list_members(profile_id);
CREATE INDEX profile_list_members_account_idx ON public.profile_list_members(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_list_members TO authenticated;
GRANT ALL ON public.profile_list_members TO service_role;

ALTER TABLE public.profile_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage list members"
  ON public.profile_list_members FOR ALL
  USING (account_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (account_id = auth.uid() OR public.has_role('admin'));

-- Extend profiles_match_query to support list_in
CREATE OR REPLACE FUNCTION public.profiles_match_query(_account_id uuid, _query jsonb)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.consents c ON c.profile_id = p.id AND c.channel = 'sms'
  WHERE p.account_id = _account_id
    AND (
      CASE WHEN _query ? 'consent_in'
        THEN COALESCE(c.status,'pending') = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'consent_in')))
        ELSE COALESCE(c.status,'pending') = 'subscribed'
      END
    )
    AND (NOT (_query ? 'country_in')
         OR p.country_code = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'country_in'))))
    AND (NOT (_query ? 'list_in')
         OR EXISTS (
           SELECT 1 FROM public.profile_list_members m
           WHERE m.profile_id = p.id
             AND m.list_id = ANY (ARRAY(SELECT jsonb_array_elements_text(_query->'list_in')::uuid))
         ))
$$;
