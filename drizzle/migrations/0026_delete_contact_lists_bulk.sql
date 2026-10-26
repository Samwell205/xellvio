CREATE OR REPLACE FUNCTION public.delete_contact_lists(
  _account_id uuid,
  _list_ids uuid[],
  _with_contacts boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5min'
AS $$
DECLARE
  _profile_ids uuid[] := ARRAY[]::uuid[];
  _deleted integer := 0;
BEGIN
  IF _with_contacts THEN
    SELECT COALESCE(array_agg(DISTINCT plm.profile_id), ARRAY[]::uuid[])
      INTO _profile_ids
    FROM public.profile_list_members plm
    WHERE plm.list_id = ANY(_list_ids)
      AND plm.account_id = _account_id;
  END IF;

  DELETE FROM public.contact_lists
  WHERE id = ANY(_list_ids)
    AND account_id = _account_id;

  IF _with_contacts AND cardinality(_profile_ids) > 0 THEN
    WITH deleted AS (
      DELETE FROM public.profiles p
      WHERE p.account_id = _account_id
        AND p.id = ANY(_profile_ids)
      RETURNING 1
    )
    SELECT count(*)::integer INTO _deleted FROM deleted;
  END IF;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_contact_lists(uuid, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_contact_lists(uuid, uuid[], boolean) TO service_role;