CREATE OR REPLACE FUNCTION public.sender_assets_protect_local_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_kind = 'local'
     AND OLD.verification_status = 'verified'
     AND NEW.verification_status = 'requires_registration'
     AND coalesce(NEW.rejection_reason, '') ILIKE '%toll-free%' THEN
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.friendly_rejection_reason := OLD.friendly_rejection_reason;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sender_assets_protect_local_verified_trg ON public.sender_assets;
CREATE TRIGGER sender_assets_protect_local_verified_trg
BEFORE UPDATE ON public.sender_assets
FOR EACH ROW EXECUTE FUNCTION public.sender_assets_protect_local_verified();

UPDATE public.sender_assets
SET verification_status = 'verified',
    verified_at = coalesce(verified_at, now()),
    rejected_at = NULL,
    rejection_reason = NULL,
    friendly_rejection_reason = NULL,
    last_synced_at = now()
WHERE sender_kind = 'local'
  AND telnyx_messaging_profile_id IS NOT NULL
  AND verification_status <> 'verified';