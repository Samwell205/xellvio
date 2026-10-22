CREATE OR REPLACE FUNCTION public.confirm_assistant_campaign_launch(_id uuid,_user_id uuid,_account_id uuid,_choice text,_user_agent text,_tos_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op public.assistant_operations; c public.campaigns; a public.accounts; snap jsonb; result jsonb; target_status text; cnt bigint; cost numeric; cc record; sender jsonb;
BEGIN
 SELECT * INTO op FROM public.assistant_operations WHERE id=_id AND user_id=_user_id AND account_id=_account_id AND kind='campaign_launch' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
 IF _user_id<>_account_id THEN
  PERFORM 1 FROM public.account_members WHERE account_id=_account_id AND user_id=_user_id AND status='active' AND role::text IN ('admin','editor') AND (role::text='admin' OR (permissions->>'campaigns'='true' AND permissions->>'audience'='true')) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
 END IF;
 IF op.status='completed' THEN RETURN op.outcome; END IF;
 IF op.status<>'pending' OR op.expires_at<=now() OR _choice NOT IN ('tested','skipped') THEN RAISE EXCEPTION 'Invalid review'; END IF;
 snap:=op.arguments->'snapshot';
 SELECT * INTO c FROM public.campaigns WHERE id=(op.arguments->>'campaignId')::uuid AND account_id=_account_id FOR UPDATE;
 IF NOT FOUND OR c.status<>'draft' OR c.updated_at<>(snap->>'updatedAt')::timestamptz OR c.media_url IS NOT NULL OR c.track_links THEN RAISE EXCEPTION 'Campaign changed'; END IF;
 SELECT * INTO a FROM public.accounts WHERE id=_account_id FOR UPDATE;
 IF NOT FOUND OR a.suspended_at IS NOT NULL OR a.sending_suspended_at IS NOT NULL OR a.tos_current_version_accepted IS DISTINCT FROM _tos_version THEN RAISE EXCEPTION 'Sending not available'; END IF;
 SELECT coalesce(sum(recipients),0) INTO cnt FROM public.eligible_country_counts(_account_id,c.audience) WHERE NOT (country_code=ANY(ARRAY(SELECT jsonb_array_elements_text(coalesce(c.audience->'excluded_countries','[]'::jsonb)))));
 IF cnt=0 OR cnt<>(snap->>'recipients')::bigint THEN RAISE EXCEPTION 'Audience changed'; END IF;
 cost:=0;
 FOR cc IN SELECT country_code,recipients FROM public.eligible_country_counts(_account_id,c.audience) WHERE NOT (country_code=ANY(ARRAY(SELECT jsonb_array_elements_text(coalesce(c.audience->'excluded_countries','[]'::jsonb))))) LOOP
  PERFORM 1 FROM public.country_rates WHERE active AND country_code=cc.country_code AND sell_price>=0 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Price unavailable'; END IF;
  SELECT cost+cc.recipients*(op.arguments->'summary'->>'segments')::numeric*sell_price INTO cost FROM public.country_rates WHERE active AND country_code=cc.country_code;
  sender:=snap->'senderMap'->cc.country_code;
  PERFORM 1 FROM public.sender_assets s WHERE s.account_id=_account_id AND s.verification_status='verified' AND (s.country_code=cc.country_code OR (cc.country_code IN ('US','CA') AND s.country_code IN ('US','CA') AND s.sender_kind IN ('local','toll_free'))) AND s.sender_kind=sender->>'sender_kind' AND s.phone_number IS NOT DISTINCT FROM sender->>'phone_number' AND s.telnyx_messaging_profile_id IS NOT DISTINCT FROM sender->>'telnyx_messaging_profile_id' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sender changed'; END IF;
 END LOOP;
 cost:=round(cost,4);
 IF cost<>(snap->>'cost')::numeric OR a.credit_balance<cost THEN RAISE EXCEPTION 'Price or balance changed'; END IF;
 IF c.send_mode='now' THEN target_status:='queued';
 ELSIF c.send_mode='scheduled' AND c.schedule_at>now() THEN target_status:='scheduled';
 ELSE RAISE EXCEPTION 'Invalid sending time'; END IF;
 INSERT INTO public.campaign_tos_acceptances(campaign_id,tenant_account_id,tos_version,user_agent) VALUES(c.id,_user_id,_tos_version,left(_user_agent,500)) ON CONFLICT(campaign_id) DO UPDATE SET tenant_account_id=excluded.tenant_account_id,tos_version=excluded.tos_version,user_agent=excluded.user_agent;
 UPDATE public.campaigns SET message_body=snap->>'body',sender_map=snap->'senderMap',status=target_status,updated_at=now() WHERE id=c.id AND status='draft';
 result:=jsonb_build_object('campaignId',c.id,'status',target_status,'testChoice',_choice);
 UPDATE public.assistant_operations SET status='completed',outcome=result WHERE id=op.id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_assistant_campaign_launch(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_assistant_campaign_launch(uuid,uuid,uuid,text,text,text) TO service_role;