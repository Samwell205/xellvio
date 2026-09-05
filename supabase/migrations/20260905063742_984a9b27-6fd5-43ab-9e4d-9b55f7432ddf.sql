-- Catalogue tables: public read only, no client writes
REVOKE ALL ON public.apps, public.app_categories, public.developers, public.app_versions,
  public.app_features, public.app_actions, public.app_triggers
  FROM anon, authenticated;
GRANT SELECT ON public.apps, public.app_categories, public.developers, public.app_versions,
  public.app_features, public.app_actions, public.app_triggers TO anon, authenticated;
-- developers/apps/features/actions/triggers are managed by signed-in developers via RLS policies
GRANT INSERT, UPDATE, DELETE ON public.apps, public.developers, public.app_versions,
  public.app_features, public.app_actions, public.app_triggers TO authenticated;
GRANT ALL ON public.apps, public.app_categories, public.developers, public.app_versions,
  public.app_features, public.app_actions, public.app_triggers TO service_role;

-- Tenant-owned tables: signed-in users only
REVOKE ALL ON public.app_installations, public.app_connections, public.app_reviews FROM anon;
GRANT SELECT ON public.app_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_installations, public.app_connections,
  public.app_reviews TO authenticated;
GRANT ALL ON public.app_installations, public.app_connections, public.app_reviews TO service_role;

-- Logs: read-only for signed-in users, written by the platform
REVOKE ALL ON public.integration_logs FROM anon, authenticated;
GRANT SELECT ON public.integration_logs TO authenticated;
GRANT ALL ON public.integration_logs TO service_role;

-- OAuth handshake state: platform only
REVOKE ALL ON public.app_oauth_states FROM anon, authenticated;
GRANT ALL ON public.app_oauth_states TO service_role;