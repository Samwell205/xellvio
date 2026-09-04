CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  profile_id uuid,
  current_node_key text,
  status text NOT NULL DEFAULT 'active',
  wait_until timestamptz,
  waiting_for text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps_run integer NOT NULL DEFAULT 0,
  last_error text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view automation runs" ON public.automation_runs FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));

CREATE INDEX IF NOT EXISTS automation_runs_due_idx ON public.automation_runs(status, wait_until);
CREATE INDEX IF NOT EXISTS automation_runs_automation_idx ON public.automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS automation_runs_phone_idx ON public.automation_runs(account_id, phone_e164);
CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_one_active_idx
  ON public.automation_runs(automation_id, phone_e164)
  WHERE status IN ('active','waiting');

CREATE TABLE IF NOT EXISTS public.automation_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  node_key text,
  node_type text,
  outcome text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_run_events TO authenticated;
GRANT ALL ON public.automation_run_events TO service_role;
ALTER TABLE public.automation_run_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view automation activity" ON public.automation_run_events FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));

CREATE INDEX IF NOT EXISTS automation_run_events_run_idx ON public.automation_run_events(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_run_events_automation_idx ON public.automation_run_events(automation_id, created_at DESC);