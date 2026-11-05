CREATE OR REPLACE FUNCTION public.submit_assisted_number_request(_account_id uuid, _requested_by uuid, _country text, _number_type text, _requested_number text, _purpose text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; existing_id uuid; ticket uuid; request_id uuid; body text; outcome jsonb;
BEGIN
 SELECT id,email,contact_email,full_name,suspended_at,onboarding_status INTO a FROM public.accounts WHERE id=_account_id FOR UPDATE;
 IF NOT FOUND OR a.suspended_at IS NOT NULL OR a.onboarding_status='suspended' THEN RAISE EXCEPTION 'This business cannot request a number right now'; END IF;
 IF _requested_by<>_account_id THEN RAISE EXCEPTION 'Only the business owner can submit this request'; END IF;
 IF _country !~ '^[A-Z]{2}$' OR _number_type NOT IN ('mobile','local','national','toll-free') OR _requested_number !~ '^\+[1-9][0-9]{6,14}$' OR length(trim(_purpose))<10 THEN RAISE EXCEPTION 'Invalid number request'; END IF;
 SELECT id INTO existing_id FROM public.assisted_number_requests WHERE account_id=_account_id AND status NOT IN ('completed','rejected');
 IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
 body:='Assisted number verification: '||_requested_number||' ('||_country||', '||_number_type||'). Purpose: '||_purpose||E'\nOne-time assistance fee: $100. Support handling target: 24 hours. Carrier approval and availability are not guaranteed; all required documents and checks still apply. Monthly number and usage charges are separate.';
 outcome:=public.create_or_append_support_ticket(_account_id,COALESCE(NULLIF(a.contact_email,''),a.email),a.full_name,'Assisted number verification — '||_requested_number,'assisted_number_verification',body,'app',NULL);
 ticket:=(outcome->'ticket'->>'id')::uuid;
 PERFORM public.debit_account(_account_id,100,NULL,'Assisted number verification — '||_requested_number||' — ticket '||ticket);
 INSERT INTO public.assisted_number_requests(account_id,requested_by,country,number_type,requested_number,purpose,ticket_id) VALUES(_account_id,_requested_by,_country,_number_type,_requested_number,_purpose,ticket) RETURNING id INTO request_id;
 RETURN request_id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_assisted_number_request(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assisted_number_request(uuid,uuid,text,text,text,text) TO service_role;