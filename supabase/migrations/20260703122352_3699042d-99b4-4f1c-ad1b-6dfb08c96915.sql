CREATE TABLE IF NOT EXISTS public.verifier_signup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.verifier_signup_codes TO service_role;

ALTER TABLE public.verifier_signup_codes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS verifier_signup_codes_email_lower_idx
  ON public.verifier_signup_codes (lower(email));

CREATE INDEX IF NOT EXISTS verifier_signup_codes_expires_idx
  ON public.verifier_signup_codes (expires_at);

DROP POLICY IF EXISTS "Service role can manage verifier signup codes" ON public.verifier_signup_codes;
CREATE POLICY "Service role can manage verifier signup codes"
  ON public.verifier_signup_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_verifier_signup_codes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_verifier_signup_codes_updated_at ON public.verifier_signup_codes;
CREATE TRIGGER update_verifier_signup_codes_updated_at
  BEFORE UPDATE ON public.verifier_signup_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_verifier_signup_codes_updated_at();