-- Favourites for lists
ALTER TABLE public.contact_lists ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- ─────────────────────────── SMS automation flows ───────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  trigger_type text NOT NULL DEFAULT 'new_contact',
  trigger_keyword text,
  trigger_list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_flows_status_chk CHECK (status IN ('draft','live','paused')),
  CONSTRAINT sms_flows_trigger_chk CHECK (trigger_type IN ('new_contact','list_join','keyword_reply'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_flows TO authenticated;
GRANT ALL ON public.sms_flows TO service_role;
ALTER TABLE public.sms_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view flows" ON public.sms_flows FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage flows" ON public.sms_flows FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));

CREATE TABLE IF NOT EXISTS public.sms_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.sms_flows(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 1,
  delay_minutes integer NOT NULL DEFAULT 0,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_flow_steps_delay_chk CHECK (delay_minutes >= 0 AND delay_minutes <= 43200)
);
CREATE INDEX IF NOT EXISTS sms_flow_steps_flow_idx ON public.sms_flow_steps(flow_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_flow_steps TO authenticated;
GRANT ALL ON public.sms_flow_steps TO service_role;
ALTER TABLE public.sms_flow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view flow steps" ON public.sms_flow_steps FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage flow steps" ON public.sms_flow_steps FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));

CREATE TABLE IF NOT EXISTS public.sms_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.sms_flows(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  step_id uuid REFERENCES public.sms_flow_steps(id) ON DELETE CASCADE,
  step_position integer NOT NULL DEFAULT 1,
  run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'scheduled',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT sms_flow_runs_status_chk CHECK (status IN ('scheduled','sent','failed','skipped'))
);
CREATE INDEX IF NOT EXISTS sms_flow_runs_due_idx ON public.sms_flow_runs(status, run_at);
CREATE UNIQUE INDEX IF NOT EXISTS sms_flow_runs_unique_step ON public.sms_flow_runs(flow_id, phone_e164, step_position);
GRANT SELECT ON public.sms_flow_runs TO authenticated;
GRANT ALL ON public.sms_flow_runs TO service_role;
ALTER TABLE public.sms_flow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view flow runs" ON public.sms_flow_runs FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));

-- ─────────────────────── Landing pages & signup forms ───────────────────────
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  headline text NOT NULL DEFAULT '',
  subheadline text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT 'Sign up',
  success_message text NOT NULL DEFAULT 'Thanks — you are subscribed!',
  theme text NOT NULL DEFAULT 'light',
  accent text NOT NULL DEFAULT '#111827',
  image_url text,
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  published boolean NOT NULL DEFAULT false,
  views integer NOT NULL DEFAULT 0,
  submissions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view landing pages" ON public.landing_pages FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage landing pages" ON public.landing_pages FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));

CREATE TABLE IF NOT EXISTS public.signup_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  headline text NOT NULL DEFAULT 'Get exclusive offers by text',
  description text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT 'Subscribe',
  success_message text NOT NULL DEFAULT 'You are on the list!',
  collect_name boolean NOT NULL DEFAULT true,
  consent_text text NOT NULL DEFAULT 'By subscribing you agree to receive recurring marketing texts. Reply STOP to opt out.',
  theme text NOT NULL DEFAULT 'light',
  accent text NOT NULL DEFAULT '#111827',
  list_id uuid REFERENCES public.contact_lists(id) ON DELETE SET NULL,
  published boolean NOT NULL DEFAULT false,
  views integer NOT NULL DEFAULT 0,
  submissions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_forms TO authenticated;
GRANT ALL ON public.signup_forms TO service_role;
ALTER TABLE public.signup_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view signup forms" ON public.signup_forms FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage signup forms" ON public.signup_forms FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));

CREATE TABLE IF NOT EXISTS public.subscribe_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  first_name text,
  last_name text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscribe_submissions_account_idx ON public.subscribe_submissions(account_id, created_at DESC);
GRANT SELECT ON public.subscribe_submissions TO authenticated;
GRANT ALL ON public.subscribe_submissions TO service_role;
ALTER TABLE public.subscribe_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view submissions" ON public.subscribe_submissions FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));