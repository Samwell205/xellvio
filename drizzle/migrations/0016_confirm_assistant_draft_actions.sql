CREATE OR REPLACE FUNCTION public.confirm_assistant_operation(_id uuid, _user_id uuid, _account_id uuid, _consent boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE op public.assistant_operations; result_id uuid; res jsonb; imported integer;
BEGIN
 SELECT * INTO op FROM public.assistant_operations WHERE id=_id AND user_id=_user_id AND account_id=_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Action not found'; END IF;
 IF op.status='completed' THEN RETURN op.outcome; END IF;
 IF op.status <> 'pending' OR op.expires_at <= now() THEN RAISE EXCEPTION 'Action expired or cancelled'; END IF;
 IF op.kind='campaign_draft' THEN
  IF NOT EXISTS(SELECT 1 FROM public.contact_lists WHERE id=(op.arguments->>'listId')::uuid AND account_id=_account_id) THEN RAISE EXCEPTION 'List not found'; END IF;
  INSERT INTO public.campaigns(account_id,name,message_body,audience,status,send_mode,track_links) VALUES(_account_id,op.arguments->>'name',op.arguments->>'body',jsonb_build_object('list_ids',jsonb_build_array(op.arguments->>'listId'),'include','[]'::jsonb,'exclude','[]'::jsonb,'profile_ids','[]'::jsonb),'draft','now',false) RETURNING id INTO result_id;
  res=jsonb_build_object('campaignId',result_id,'status','draft');
 ELSIF op.kind='contact_import' THEN
  IF NOT _consent THEN RAISE EXCEPTION 'Confirm that these contacts opted in'; END IF;
  INSERT INTO public.contact_lists(account_id,name) VALUES(_account_id,op.arguments->>'name') RETURNING id INTO result_id;
  SELECT upserted INTO imported FROM public.bulk_import_profiles(_account_id,result_id,op.arguments->'rows');
  res=jsonb_build_object('listId',result_id,'imported',coalesce(imported,0),'status','completed');
 ELSIF op.kind='assistant_draft' THEN
  INSERT INTO public.receptionist_assistants(account_id,name,configuration) VALUES(_account_id,op.arguments->>'name',op.arguments->'config') RETURNING id INTO result_id;
  res=jsonb_build_object('assistantId',result_id,'status','draft');
 ELSE RAISE EXCEPTION 'Unsupported action'; END IF;
 UPDATE public.assistant_operations SET status='completed',outcome=res WHERE id=_id;
 RETURN res;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_assistant_operation(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_assistant_operation(uuid,uuid,uuid,boolean) TO service_role;