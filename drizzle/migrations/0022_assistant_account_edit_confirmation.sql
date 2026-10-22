CREATE OR REPLACE FUNCTION public.confirm_assistant_account_edit(_id uuid, _user_id uuid, _account_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE op public.assistant_operations; resource text; field_name text; table_name text; permission_name text; target_id uuid; current_row jsonb; value_text text; changed integer; result jsonb;
BEGIN
 SELECT * INTO op FROM public.assistant_operations WHERE id=_id AND user_id=_user_id AND account_id=_account_id FOR UPDATE;
 IF NOT FOUND OR op.kind <> 'account_edit' THEN RAISE EXCEPTION 'Action not found'; END IF;
 resource:=op.arguments->>'resource'; field_name:=op.arguments->>'field'; target_id:=(op.arguments->>'id')::uuid; value_text:=op.arguments->>'value';
 CASE resource
  WHEN 'settings' THEN table_name:='accounts'; permission_name:='settings';
  WHEN 'contact' THEN table_name:='profiles'; permission_name:='audience';
  WHEN 'list' THEN table_name:='contact_lists'; permission_name:='audience';
  WHEN 'campaign' THEN table_name:='campaigns'; permission_name:='campaigns';
  WHEN 'website' THEN table_name:='landing_pages'; permission_name:='settings';
  WHEN 'form' THEN table_name:='signup_forms'; permission_name:='settings';
  WHEN 'automation' THEN table_name:='automations'; permission_name:='campaigns';
  WHEN 'flow' THEN table_name:='sms_flows'; permission_name:='campaigns';
  ELSE RAISE EXCEPTION 'Unsupported action';
 END CASE;
 IF _user_id <> _account_id THEN
  IF resource='settings' THEN RAISE EXCEPTION 'Owner required'; END IF;
  PERFORM 1 FROM public.account_members WHERE user_id=_user_id AND account_id=_account_id AND status='active' AND (role::text='admin' OR permissions->>permission_name='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
 END IF;
 IF NOT ((resource='settings' AND field_name IN ('full_name','company','phone')) OR (resource='contact' AND field_name IN ('first_name','last_name')) OR (resource IN ('list','website','form') AND field_name='name') OR (resource='campaign' AND field_name IN ('name','message_body')) OR (resource IN ('automation','flow') AND field_name IN ('name','status'))) THEN RAISE EXCEPTION 'Field not allowed'; END IF;
 IF value_text IS NULL OR length(btrim(value_text))=0 OR length(value_text)>(CASE WHEN field_name='message_body' THEN 1600 ELSE 120 END) THEN RAISE EXCEPTION 'Invalid value'; END IF;
 IF field_name='status' AND value_text <> 'paused' THEN RAISE EXCEPTION 'Activation not allowed'; END IF;
 IF op.status='completed' THEN RETURN op.outcome; END IF;
 IF op.status <> 'pending' OR op.expires_at <= now() THEN RAISE EXCEPTION 'Action expired or cancelled'; END IF;
 IF resource='settings' THEN
  IF target_id <> _account_id THEN RAISE EXCEPTION 'Account mismatch'; END IF;
  SELECT to_jsonb(a) INTO current_row FROM public.accounts a WHERE id=target_id FOR UPDATE;
 ELSE
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND account_id=$2 FOR UPDATE',table_name) INTO current_row USING target_id,_account_id;
 END IF;
 IF current_row IS NULL THEN RAISE EXCEPTION 'Target not found'; END IF;
 IF resource='campaign' AND current_row->>'status' <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be edited'; END IF;
 IF resource IN ('automation','flow') AND current_row->>'status' IN ('archived','deleted') THEN RAISE EXCEPTION 'Target stopped'; END IF;
 IF coalesce(current_row->field_name,'null'::jsonb) IS DISTINCT FROM coalesce(op.arguments->'before','null'::jsonb) THEN RAISE EXCEPTION 'Target changed; prepare a fresh proposal'; END IF;
 IF resource='settings' THEN
  EXECUTE format('UPDATE public.accounts SET %I=$1 WHERE id=$2',field_name) USING value_text,target_id;
 ELSE
  EXECUTE format('UPDATE public.%I SET %I=$1,updated_at=now() WHERE id=$2 AND account_id=$3',table_name,field_name) USING value_text,target_id,_account_id;
 END IF;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Target changed'; END IF;
 result:=jsonb_build_object('resourceId',target_id,'resource',resource,'field',field_name,'value',value_text,'status','completed');
 UPDATE public.assistant_operations SET status='completed',outcome=result WHERE id=op.id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_assistant_account_edit(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_assistant_account_edit(uuid,uuid,uuid) TO service_role;