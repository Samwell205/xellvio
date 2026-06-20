CREATE TABLE public.tollfree_verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  sender_asset_id uuid NULL,
  phone_number text NULL,
  phone_sid text NULL,
  messaging_service_sid text NULL,
  verification_sid text NULL,
  attempt_status text NOT NULL DEFAULT 'started',
  failure_reason text NULL,
  friendly_failure_reason text NULL,
  twilio_status integer NULL,
  twilio_code text NULL,
  twilio_more_info text NULL,
  twilio_response jsonb NULL,
  request_summary jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tollfree_verification_attempts_status_check CHECK (
    attempt_status IN ('started', 'number_reserved', 'submitted', 'already_submitted', 'failed', 'no_verification_sid')
  )
);

GRANT SELECT ON public.tollfree_verification_attempts TO authenticated;
GRANT ALL ON public.tollfree_verification_attempts TO service_role;

ALTER TABLE public.tollfree_verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read tollfree verification attempts"
ON public.tollfree_verification_attempts
FOR SELECT
TO authenticated
USING (public.has_role('admin'::public.app_role));

CREATE POLICY "Service role can manage tollfree verification attempts"
ON public.tollfree_verification_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX tollfree_verification_attempts_account_created_idx
ON public.tollfree_verification_attempts (account_id, created_at DESC);

CREATE INDEX tollfree_verification_attempts_status_created_idx
ON public.tollfree_verification_attempts (attempt_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_tollfree_verification_attempts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_tollfree_verification_attempts_updated_at() FROM anon, authenticated;

CREATE TRIGGER update_tollfree_verification_attempts_updated_at
BEFORE UPDATE ON public.tollfree_verification_attempts
FOR EACH ROW
EXECUTE FUNCTION public.touch_tollfree_verification_attempts_updated_at();