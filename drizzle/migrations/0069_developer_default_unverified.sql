CREATE OR REPLACE FUNCTION public.developers_block_self_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_service() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'unverified';
    NEW.is_first_party := false;
  ELSE
    NEW.verification_status := OLD.verification_status;
    NEW.is_first_party := OLD.is_first_party;
  END IF;
  RETURN NEW;
END $$;