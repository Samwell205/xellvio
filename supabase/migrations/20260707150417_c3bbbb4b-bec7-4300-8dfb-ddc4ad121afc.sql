ALTER TABLE public.sender_assets DROP CONSTRAINT IF EXISTS sender_assets_verification_status_check;
ALTER TABLE public.sender_assets ADD CONSTRAINT sender_assets_verification_status_check
  CHECK (verification_status IN ('pending','submitted','in_review','verified','rejected','requires_registration'));

ALTER TABLE public.sender_assets REPLICA IDENTITY FULL;
ALTER TABLE public.verifier_tfns REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sender_assets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.verifier_tfns;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;