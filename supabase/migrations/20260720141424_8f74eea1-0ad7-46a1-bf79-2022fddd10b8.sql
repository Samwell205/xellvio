
CREATE OR REPLACE FUNCTION public.my_eligible_profile_count(_audience jsonb)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT count(*)::integer FROM public.eligible_profile_ids(public.get_acting_account_id(auth.uid()), _audience);
$$;

CREATE OR REPLACE FUNCTION public.my_eligible_profile_ids_page(_audience jsonb, _limit integer DEFAULT 1000, _offset integer DEFAULT 0)
RETURNS TABLE(profile_id uuid, phone_e164 text, first_name text, last_name text, country_code text)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT * FROM public.eligible_profile_ids_page(public.get_acting_account_id(auth.uid()), _audience, _limit, _offset);
$$;
