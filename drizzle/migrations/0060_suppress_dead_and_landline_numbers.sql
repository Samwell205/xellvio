CREATE OR REPLACE FUNCTION public.record_unroutable_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c text := regexp_replace(coalesce(NEW.error_code,''), '^TW', ''); r text; n int;
BEGIN
  IF NEW.phone_e164 IS NULL THEN RETURN NEW; END IF;
  IF c IN ('40001','30006') THEN r := 'Landline or non-routable number';
  ELSIF c IN ('40012','30005') THEN r := 'Invalid or unreachable number';
  ELSIF c = '30003' THEN
    SELECT count(*) INTO n FROM public.messages m
     WHERE m.phone_e164 = NEW.phone_e164 AND m.created_at > now() - interval '60 days'
       AND m.error_code IN ('30003','TW30003')
       AND NOT EXISTS (SELECT 1 FROM public.messages d WHERE d.phone_e164 = NEW.phone_e164
                       AND d.status = 'delivered' AND d.created_at > m.created_at);
    IF n >= 3 THEN r := 'Repeatedly unreachable number'; END IF;
  END IF;
  IF r IS NOT NULL THEN
    INSERT INTO public.unroutable_numbers (phone_e164, error_code, reason)
    VALUES (NEW.phone_e164, NEW.error_code, r)
    ON CONFLICT (phone_e164) DO UPDATE SET hits = public.unroutable_numbers.hits + 1,
      error_code = EXCLUDED.error_code, reason = EXCLUDED.reason, last_seen_at = now();
  END IF;
  RETURN NEW;
END $$;

INSERT INTO public.unroutable_numbers (phone_e164, error_code, reason, hits, first_seen_at, last_seen_at)
SELECT phone_e164, max(error_code),
  CASE WHEN bool_or(error_code IN ('30006','TW30006')) THEN 'Landline or non-routable number' ELSE 'Invalid or unreachable number' END,
  count(*)::int, min(created_at), max(created_at)
FROM public.messages
WHERE error_code IN ('30005','TW30005','30006','TW30006') AND phone_e164 IS NOT NULL
GROUP BY phone_e164
ON CONFLICT (phone_e164) DO NOTHING;

INSERT INTO public.unroutable_numbers (phone_e164, error_code, reason, hits, first_seen_at, last_seen_at)
SELECT m.phone_e164, 'TW30003', 'Repeatedly unreachable number', count(*)::int, min(m.created_at), max(m.created_at)
FROM public.messages m
WHERE m.error_code IN ('30003','TW30003') AND m.phone_e164 IS NOT NULL AND m.created_at > now() - interval '60 days'
  AND NOT EXISTS (SELECT 1 FROM public.messages d WHERE d.phone_e164 = m.phone_e164 AND d.status='delivered' AND d.created_at > m.created_at)
GROUP BY m.phone_e164 HAVING count(*) >= 3
ON CONFLICT (phone_e164) DO NOTHING;