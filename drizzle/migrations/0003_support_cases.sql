CREATE TABLE public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  account_id uuid,
  title text NOT NULL DEFAULT 'New case',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_cases TO service_role;
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX support_cases_updated_idx ON public.support_cases (updated_at DESC);