CREATE TABLE public.internal_job_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.internal_job_secrets FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.internal_job_secrets TO service_role;
ALTER TABLE public.internal_job_secrets ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_job_secrets(name, value)
VALUES ('cron', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

REVOKE EXECUTE ON FUNCTION public.claim_and_sell_verified_tfn(uuid, numeric, numeric) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_and_sell_verified_tfn(uuid, numeric, numeric) TO service_role;