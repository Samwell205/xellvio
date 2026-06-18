
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_codes_user_e164_idx
  ON public.verification_codes (user_id, e164, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.verification_codes TO authenticated;
GRANT ALL ON public.verification_codes TO service_role;

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own verification codes"
  ON public.verification_codes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Backfill from legacy phone_verifications if present
INSERT INTO public.verification_codes (id, user_id, e164, code_hash, attempts, consumed_at, expires_at, created_at)
SELECT id, user_id, e164, code_hash, attempts, consumed_at, expires_at, created_at
FROM public.phone_verifications
ON CONFLICT (id) DO NOTHING;
