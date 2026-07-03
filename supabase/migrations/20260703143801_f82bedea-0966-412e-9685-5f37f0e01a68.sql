
ALTER TABLE public.verifier_tfns
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at  timestamptz;

ALTER TABLE public.sender_assets
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at  timestamptz;

-- Backfill best-effort from current status
UPDATE public.verifier_tfns SET submitted_at = COALESCE(submitted_at, updated_at)
  WHERE status IN ('pending_verification','verified','rejected','sold') AND submitted_at IS NULL;
UPDATE public.verifier_tfns SET verified_at = COALESCE(verified_at, updated_at)
  WHERE status IN ('verified','sold') AND verified_at IS NULL;
UPDATE public.verifier_tfns SET rejected_at = COALESCE(rejected_at, updated_at)
  WHERE status = 'rejected' AND rejected_at IS NULL;

UPDATE public.sender_assets SET submitted_at = COALESCE(submitted_at, last_synced_at, updated_at)
  WHERE verification_status IN ('submitted','in_review','verified','rejected') AND submitted_at IS NULL;
UPDATE public.sender_assets SET in_review_at = COALESCE(in_review_at, last_synced_at, updated_at)
  WHERE verification_status IN ('in_review','verified','rejected') AND in_review_at IS NULL;
UPDATE public.sender_assets SET verified_at = COALESCE(verified_at, last_synced_at, updated_at)
  WHERE verification_status = 'verified' AND verified_at IS NULL;
UPDATE public.sender_assets SET rejected_at = COALESCE(rejected_at, last_synced_at, updated_at)
  WHERE verification_status = 'rejected' AND rejected_at IS NULL;

-- Idempotency log for Twilio webhooks
CREATE TABLE IF NOT EXISTS public.twilio_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_hash text NOT NULL UNIQUE,
  verification_sid text,
  status text,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.twilio_webhook_events TO service_role;
ALTER TABLE public.twilio_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.twilio_webhook_events FOR SELECT USING (false);
