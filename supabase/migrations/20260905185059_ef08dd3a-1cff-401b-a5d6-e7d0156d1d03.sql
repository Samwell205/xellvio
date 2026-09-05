ALTER TABLE public.landing_pages ADD COLUMN IF NOT EXISTS source_template TEXT, ADD COLUMN IF NOT EXISTS source_template_version TEXT;
ALTER TABLE public.signup_forms ADD COLUMN IF NOT EXISTS source_template TEXT, ADD COLUMN IF NOT EXISTS source_template_version TEXT;
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS source_template TEXT, ADD COLUMN IF NOT EXISTS source_template_version TEXT;

CREATE TABLE IF NOT EXISTS public.template_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL,
  template_slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('view','preview','use_click','import','publish')),
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS template_events_slug_idx ON public.template_events (template_type, template_slug, created_at DESC);

GRANT ALL ON public.template_events TO service_role;
GRANT SELECT ON public.template_events TO authenticated;
ALTER TABLE public.template_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read template events" ON public.template_events;
CREATE POLICY "Admins can read template events" ON public.template_events FOR SELECT TO authenticated USING (public.has_role('admin'::app_role));