CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled automation',
  status text NOT NULL DEFAULT 'draft',
  viewport jsonb NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automations_status_chk CHECK (status IN ('draft','active','paused','archived'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view automations" ON public.automations FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage automations" ON public.automations FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));

CREATE TABLE IF NOT EXISTS public.automation_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  type text NOT NULL,
  label text NOT NULL DEFAULT '',
  position jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, node_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_nodes TO authenticated;
GRANT ALL ON public.automation_nodes TO service_role;
ALTER TABLE public.automation_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view automation nodes" ON public.automation_nodes FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage automation nodes" ON public.automation_nodes FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));
CREATE INDEX IF NOT EXISTS automation_nodes_automation_idx ON public.automation_nodes(automation_id);

CREATE TABLE IF NOT EXISTS public.automation_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  edge_key text NOT NULL,
  source_node_key text NOT NULL,
  target_node_key text NOT NULL,
  source_handle text,
  target_handle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, edge_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_connections TO authenticated;
GRANT ALL ON public.automation_connections TO service_role;
ALTER TABLE public.automation_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view automation connections" ON public.automation_connections FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "Team editors manage automation connections" ON public.automation_connections FOR ALL TO authenticated USING (public.has_account_access(account_id, 'editor')) WITH CHECK (public.has_account_access(account_id, 'editor'));
CREATE INDEX IF NOT EXISTS automation_connections_automation_idx ON public.automation_connections(automation_id);