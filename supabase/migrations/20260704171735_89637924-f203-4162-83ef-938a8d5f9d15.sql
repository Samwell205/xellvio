CREATE OR REPLACE FUNCTION public.sync_sender_asset_from_number_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind TEXT;
  next_status TEXT;
BEGIN
  IF NEW.status IN ('approved','provisioned')
     AND NEW.assigned_phone_number IS NOT NULL
     AND NEW.assigned_phone_number <> ''
  THEN
    kind := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'toll_free'
      ELSE 'local'
    END;

    next_status := CASE NEW.number_type::text
      WHEN 'toll_free' THEN 'pending'
      ELSE 'verified'
    END;

    IF EXISTS (
      SELECT 1 FROM public.sender_assets
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number
    ) THEN
      UPDATE public.sender_assets
      SET verification_status = CASE
            WHEN sender_kind = 'toll_free'
             AND telnyx_verification_id IS NOT NULL
             AND verification_status IN ('submitted','in_review','verified','rejected')
            THEN verification_status
            ELSE next_status
          END,
          sender_kind = kind,
          updated_at = now(),
          last_synced_at = now(),
          rejection_reason = CASE WHEN next_status = 'pending' THEN NULL ELSE rejection_reason END,
          friendly_rejection_reason = CASE WHEN next_status = 'pending' THEN NULL ELSE friendly_rejection_reason END
      WHERE account_id = NEW.account_id
        AND country_code = NEW.country::text
        AND phone_number = NEW.assigned_phone_number;
    ELSE
      INSERT INTO public.sender_assets (
        account_id, country_code, sender_kind, phone_number,
        verification_status, last_synced_at
      ) VALUES (
        NEW.account_id, NEW.country::text, kind, NEW.assigned_phone_number,
        next_status, now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.sender_assets sa
SET verification_status = 'pending',
    rejection_reason = NULL,
    friendly_rejection_reason = NULL,
    last_synced_at = now(),
    updated_at = now()
WHERE sa.sender_kind = 'toll_free'
  AND sa.verification_status = 'verified'
  AND sa.telnyx_verification_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.number_requests nr
    WHERE nr.account_id = sa.account_id
      AND nr.country::text = sa.country_code
      AND nr.assigned_phone_number = sa.phone_number
      AND nr.number_type::text = 'toll_free'
      AND nr.status IN ('approved','provisioned')
  );