CREATE INDEX IF NOT EXISTS messages_profile_id_idx ON public.messages (profile_id);

CREATE OR REPLACE FUNCTION public.delete_contact_list(_account_id uuid, _list_id uuid, _with_contacts boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contact_lists WHERE id = _list_id AND account_id = _account_id) THEN
    RAISE EXCEPTION 'List not found';
  END IF;

  IF _with_contacts THEN
    WITH ids AS (
      SELECT profile_id FROM public.profile_list_members WHERE list_id = _list_id AND account_id = _account_id
    ), del AS (
      DELETE FROM public.profiles p WHERE p.account_id = _account_id AND p.id IN (SELECT profile_id FROM ids) RETURNING 1
    )
    SELECT count(*) INTO _deleted FROM del;
  END IF;

  DELETE FROM public.profile_list_members WHERE list_id = _list_id;
  DELETE FROM public.contact_lists WHERE id = _list_id AND account_id = _account_id;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_contact_list(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_contact_list(uuid, uuid, boolean) TO service_role;