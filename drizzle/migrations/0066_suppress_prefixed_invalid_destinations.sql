CREATE OR REPLACE FUNCTION public.sms_capture_destination_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE acct uuid; code text;
BEGIN
  SELECT account_id INTO acct FROM public.campaigns WHERE id=NEW.campaign_id;
  IF acct IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('sending','sent','delivered','delivery_unconfirmed') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.sms_phone_history(account_id,phone_e164,last_message_id,last_sent_at)
    VALUES(acct,NEW.phone_e164,NEW.id,COALESCE(NEW.sent_at,NEW.dispatch_started_at,now()))
    ON CONFLICT(account_id,phone_e164) DO UPDATE SET last_message_id=EXCLUDED.last_message_id,last_sent_at=EXCLUDED.last_sent_at
    WHERE sms_phone_history.last_sent_at<=EXCLUDED.last_sent_at;
  END IF;
  code := regexp_replace(coalesce(NEW.error_code,''),'^TW','');
  IF NEW.status IN ('failed','undelivered') AND code IN ('30005','30006','40001','40012','40310','21211','21614','invalid_phone_number') THEN
    INSERT INTO public.sms_invalid_destinations(account_id,phone_e164,reason,source_message_id)
    VALUES(acct,NEW.phone_e164,CASE WHEN code IN ('30006','40001','21614') THEN 'landline' ELSE 'invalid_number' END,NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

INSERT INTO public.sms_invalid_destinations(account_id,phone_e164,reason,source_message_id)
SELECT DISTINCT ON (c.account_id,m.phone_e164) c.account_id,m.phone_e164,
  CASE WHEN m.error_code IN ('TW30006','TW21614') THEN 'landline' ELSE 'invalid_number' END, m.id
FROM public.messages m JOIN public.campaigns c ON c.id=m.campaign_id
WHERE m.status IN ('failed','undelivered') AND m.error_code IN ('TW30005','TW30006','TW21211','TW21614')
ORDER BY c.account_id,m.phone_e164,m.created_at DESC
ON CONFLICT DO NOTHING;