CREATE OR REPLACE FUNCTION public.edit_receptionist_assistant(_account_id uuid, _assistant_id uuid, _configuration jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; a record;
BEGIN
 SELECT * INTO s FROM public.receptionist_settings WHERE account_id=_account_id FOR UPDATE;
 SELECT * INTO a FROM public.receptionist_assistants WHERE account_id=_account_id AND id=_assistant_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assistant not found'; END IF;
 IF s.selected_assistant_id=_assistant_id THEN
  IF s.enabled OR EXISTS(SELECT 1 FROM public.receptionist_calls WHERE account_id=_account_id AND ended_at IS NULL) THEN RAISE EXCEPTION 'Pause calling and wait for active calls to end'; END IF;
  UPDATE public.receptionist_settings SET configuration=_configuration,test_verified_at=NULL,updated_at=now() WHERE account_id=_account_id;
 END IF;
 UPDATE public.receptionist_assistants SET configuration=_configuration,name=coalesce(nullif(_configuration->>'assistantName',''),name),sync_status=CASE WHEN carrier_assistant_id IS NULL THEN 'draft' ELSE 'changes_pending' END,updated_at=now() WHERE id=_assistant_id AND account_id=_account_id;
END; $$;
REVOKE ALL ON FUNCTION public.edit_receptionist_assistant(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_receptionist_assistant(uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.delete_receptionist_assistant(_account_id uuid, _assistant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selected uuid; a record;
BEGIN
 SELECT selected_assistant_id INTO selected FROM public.receptionist_settings WHERE account_id=_account_id FOR UPDATE;
 SELECT * INTO a FROM public.receptionist_assistants WHERE id=_assistant_id AND account_id=_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assistant not found'; END IF;
 IF selected=_assistant_id THEN RAISE EXCEPTION 'Select a different assistant before deleting'; END IF;
 IF a.archived_at IS NULL THEN RAISE EXCEPTION 'Archive the assistant before deleting'; END IF;
 DELETE FROM public.receptionist_assistants WHERE id=_assistant_id AND account_id=_account_id;
END; $$;
REVOKE ALL ON FUNCTION public.delete_receptionist_assistant(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_receptionist_assistant(uuid,uuid) TO service_role;