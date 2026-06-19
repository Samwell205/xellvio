CREATE OR REPLACE FUNCTION public.sync_sender_asset_from_number_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind TEXT;
BEGIN
  IF NEW.status IN ('approved','provisioned')
     AND NEW.assigned_phone_number IS NOT NULL
     AND NEW.assigned_phone_number <> ''
  THEN
    kind := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'toll_free'
      ELSE 'local'
    END;

    IF EXISTS (
      SELECT 1 FROM public.sender_assets
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number
    ) THEN
      UPDATE public.sender_assets
      SET verification_status = 'verified',
          sender_kind = kind,
          updated_at = now(),
          last_synced_at = now(),
          rejection_reason = NULL,
          friendly_rejection_reason = NULL
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number;
    ELSE
      INSERT INTO public.sender_assets (
        account_id, country_code, sender_kind, phone_number,
        verification_status, last_synced_at
      ) VALUES (
        NEW.account_id, NEW.country::text, kind, NEW.assigned_phone_number,
        'verified', now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.sender_assets (account_id, country_code, sender_kind, phone_number, verification_status, last_synced_at)
SELECT nr.account_id,
       nr.country::text,
       CASE nr.number_type::text WHEN 'toll_free' THEN 'toll_free' ELSE 'local' END,
       nr.assigned_phone_number,
       'verified',
       now()
FROM public.number_requests nr
WHERE nr.status IN ('approved','provisioned')
  AND nr.assigned_phone_number IS NOT NULL
  AND nr.assigned_phone_number <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.sender_assets sa
    WHERE sa.account_id = nr.account_id
      AND sa.country_code = nr.country::text
      AND sa.phone_number = nr.assigned_phone_number
  );