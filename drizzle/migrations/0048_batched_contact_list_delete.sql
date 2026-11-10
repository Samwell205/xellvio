CREATE INDEX IF NOT EXISTS email_recipients_profile_id_idx ON public.email_recipients(profile_id);
CREATE INDEX IF NOT EXISTS sms_flows_trigger_list_id_idx ON public.sms_flows(trigger_list_id);
CREATE INDEX IF NOT EXISTS landing_pages_list_id_idx ON public.landing_pages(list_id);
CREATE INDEX IF NOT EXISTS signup_forms_list_id_idx ON public.signup_forms(list_id);
CREATE INDEX IF NOT EXISTS email_campaigns_list_id_idx ON public.email_campaigns(list_id);

CREATE OR REPLACE FUNCTION public.delete_contact_lists_step(_account_id uuid, _list_ids uuid[], _with_contacts boolean, _batch integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '50s'
AS $$
DECLARE
  _deleted integer := 0;
  _lim integer := LEAST(GREATEST(COALESCE(_batch, 2000), 100), 5000);
BEGIN
  IF _with_contacts THEN
    WITH targets AS (
      SELECT DISTINCT plm.profile_id
      FROM public.profile_list_members plm
      WHERE plm.list_id = ANY(_list_ids) AND plm.account_id = _account_id
      LIMIT _lim
    ), deleted AS (
      DELETE FROM public.profiles p
      USING targets t
      WHERE p.id = t.profile_id AND p.account_id = _account_id
      RETURNING 1
    )
    SELECT count(*)::integer INTO _deleted FROM deleted;
    IF _deleted >= _lim THEN
      RETURN jsonb_build_object('deleted', _deleted, 'done', false);
    END IF;
  END IF;

  DELETE FROM public.contact_lists WHERE id = ANY(_list_ids) AND account_id = _account_id;
  RETURN jsonb_build_object('deleted', _deleted, 'done', true);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_contact_lists_step(uuid, uuid[], boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contact_lists_step(uuid, uuid[], boolean, integer) TO service_role;