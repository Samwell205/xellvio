
-- 1) Lifecycle profile per workspace
CREATE TABLE public.tenant_lifecycle (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'new',
  onboarding_state text NOT NULL DEFAULT 'in_progress',
  progress_pct integer NOT NULL DEFAULT 0,
  plan text,
  first_login_at timestamptz,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  workspace_completed_at timestamptz,
  first_audience_at timestamptz,
  first_contacts_at timestamptz,
  first_campaign_at timestamptz,
  first_campaign_sent_at timestamptz,
  first_automation_at timestamptz,
  first_landing_page_at timestamptz,
  first_form_at timestamptz,
  onboarding_completed_at timestamptz,
  celebrated_first_send_at timestamptz,
  checklist_dismissed_until timestamptz,
  welcome_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tenant_lifecycle TO authenticated;
GRANT ALL ON public.tenant_lifecycle TO service_role;
ALTER TABLE public.tenant_lifecycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own lifecycle" ON public.tenant_lifecycle FOR SELECT TO authenticated
  USING (public.has_account_access(account_id, 'viewer') OR public.has_role('admin'));
CREATE POLICY "admins manage lifecycle" ON public.tenant_lifecycle FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- 2) Product event timeline
CREATE TABLE public.tenant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_events_account_created_idx ON public.tenant_events (account_id, created_at DESC);
CREATE INDEX tenant_events_event_idx ON public.tenant_events (event, created_at DESC);
GRANT SELECT ON public.tenant_events TO authenticated;
GRANT ALL ON public.tenant_events TO service_role;
ALTER TABLE public.tenant_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own events" ON public.tenant_events FOR SELECT TO authenticated
  USING (public.has_account_access(account_id, 'viewer') OR public.has_role('admin'));

-- 3) Message log (frequency control + in-app delivery)
CREATE TABLE public.lifecycle_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  category text NOT NULL DEFAULT 'onboarding',
  channel text NOT NULL DEFAULT 'in_app',
  title text,
  body text,
  cta_label text,
  cta_path text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  clicked_at timestamptz,
  dismissed_at timestamptz
);
CREATE INDEX lifecycle_messages_account_idx ON public.lifecycle_messages (account_id, sent_at DESC);
CREATE UNIQUE INDEX lifecycle_messages_once_idx ON public.lifecycle_messages (account_id, template_key, channel);
GRANT SELECT, UPDATE ON public.lifecycle_messages TO authenticated;
GRANT ALL ON public.lifecycle_messages TO service_role;
ALTER TABLE public.lifecycle_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own lifecycle messages" ON public.lifecycle_messages FOR SELECT TO authenticated
  USING (public.has_account_access(account_id, 'viewer') OR public.has_role('admin'));
CREATE POLICY "members update own lifecycle messages" ON public.lifecycle_messages FOR UPDATE TO authenticated
  USING (public.has_account_access(account_id, 'viewer')) WITH CHECK (public.has_account_access(account_id, 'viewer'));

-- 4) Editable message templates
CREATE TABLE public.lifecycle_templates (
  key text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'onboarding',
  channels text[] NOT NULL DEFAULT ARRAY['in_app','email'],
  subject text,
  title text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_path text,
  delay_minutes integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lifecycle_templates TO authenticated;
GRANT ALL ON public.lifecycle_templates TO service_role;
ALTER TABLE public.lifecycle_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage lifecycle templates" ON public.lifecycle_templates FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- 5) Contextual tips seen
CREATE TABLE public.tenant_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tip_key text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  UNIQUE (account_id, tip_key)
);
GRANT SELECT, INSERT, UPDATE ON public.tenant_tips TO authenticated;
GRANT ALL ON public.tenant_tips TO service_role;
ALTER TABLE public.tenant_tips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage own tips" ON public.tenant_tips FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'viewer')) WITH CHECK (public.has_account_access(account_id, 'viewer'));

-- 6) Communication preferences
CREATE TABLE public.tenant_comm_prefs (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  product_updates boolean NOT NULL DEFAULT true,
  educational boolean NOT NULL DEFAULT true,
  promotional boolean NOT NULL DEFAULT true,
  announcements boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tenant_comm_prefs TO authenticated;
GRANT ALL ON public.tenant_comm_prefs TO service_role;
ALTER TABLE public.tenant_comm_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage own comm prefs" ON public.tenant_comm_prefs FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'viewer')) WITH CHECK (public.has_account_access(account_id, 'viewer'));

-- 7) Product announcements
CREATE TABLE public.lifecycle_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'feature',
  cta_label text,
  cta_path text,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  target_stages text[],
  target_plans text[],
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lifecycle_announcements TO authenticated;
GRANT ALL ON public.lifecycle_announcements TO service_role;
ALTER TABLE public.lifecycle_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed-in read published announcements" ON public.lifecycle_announcements FOR SELECT TO authenticated
  USING (published_at IS NOT NULL AND (expires_at IS NULL OR expires_at > now()));
CREATE POLICY "admins manage announcements" ON public.lifecycle_announcements FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE TABLE public.announcement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.lifecycle_announcements(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  dismissed_at timestamptz,
  UNIQUE (announcement_id, account_id)
);
GRANT SELECT, INSERT, UPDATE ON public.announcement_receipts TO authenticated;
GRANT ALL ON public.announcement_receipts TO service_role;
ALTER TABLE public.announcement_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage own receipts" ON public.announcement_receipts FOR ALL TO authenticated
  USING (public.has_account_access(account_id, 'viewer')) WITH CHECK (public.has_account_access(account_id, 'viewer'));
CREATE POLICY "admins read receipts" ON public.announcement_receipts FOR SELECT TO authenticated
  USING (public.has_role('admin'));

-- 8) Promotions (admin only)
CREATE TABLE public.lifecycle_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_path text,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  target_stages text[],
  credit_below numeric,
  min_account_age_days integer,
  frequency_days integer NOT NULL DEFAULT 30,
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lifecycle_promotions TO service_role;
ALTER TABLE public.lifecycle_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage promotions" ON public.lifecycle_promotions FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifecycle_promotions TO authenticated;

-- updated_at triggers
CREATE TRIGGER tenant_lifecycle_touch BEFORE UPDATE ON public.tenant_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER lifecycle_templates_touch BEFORE UPDATE ON public.lifecycle_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tenant_comm_prefs_touch BEFORE UPDATE ON public.tenant_comm_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER lifecycle_announcements_touch BEFORE UPDATE ON public.lifecycle_announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER lifecycle_promotions_touch BEFORE UPDATE ON public.lifecycle_promotions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Default editable templates
INSERT INTO public.lifecycle_templates (key, name, category, channels, subject, title, body, cta_label, cta_path, delay_minutes) VALUES
('welcome','Welcome new tenant','onboarding',ARRAY['in_app','email'],'Welcome to Xellvio 👋 Let''s get your first campaign running','Welcome to Xellvio, {{first_name}} 👋','Let''s get your first SMS campaign running. Start by setting up your workspace, creating an audience, and adding your contacts.','Complete Your Setup','/app/onboarding',0),
('workspace_reminder','Complete workspace reminder','onboarding',ARRAY['in_app','email'],'Your Xellvio workspace is waiting','Finish setting up your workspace','Your Xellvio workspace is waiting for you. Complete your setup and start building your first SMS campaign.','Complete Setup','/app/onboarding',60),
('audience_reminder','Create first audience','onboarding',ARRAY['in_app','email'],'Create your first audience','Create your first audience','Your first audience is the foundation of every great SMS campaign. Create one and start organizing your contacts.','Create Audience','/app/lists',1440),
('contacts_reminder','Import contacts reminder','onboarding',ARRAY['in_app','email'],'Add the people you want to reach','Your audience is ready 🎉','Now add the people you want to reach.','Import Contacts','/app/audience',60),
('campaign_reminder','Create first campaign','onboarding',ARRAY['in_app','email'],'Turn your contacts into your first campaign','Your contacts are ready','Now turn them into your first SMS campaign.','Create Campaign','/app/campaigns/new',60),
('send_reminder','Send first campaign reminder','onboarding',ARRAY['in_app','email'],'Your campaign is almost ready','Your campaign is almost ready','Review it and launch when you''re ready.','Continue Campaign','/app/campaigns',1440),
('first_success','First success celebration','milestone',ARRAY['in_app','email'],'🎉 Your first campaign is live','🎉 Congratulations!','You''ve successfully launched your first campaign with Xellvio.','See your report','/app/campaigns',0),
('inactive_3d','3-day inactivity check','educational',ARRAY['email','in_app'],'Need a hand getting started?','Need a hand getting started?','Pick up where you left off — your Xellvio workspace is ready.','Continue onboarding','/app',4320),
('inactive_7d','7-day re-engagement','educational',ARRAY['email','in_app'],'Continue where you left off','We noticed you haven''t been back','Your next step is waiting in your workspace.','Continue Where You Left Off','/app',10080),
('inactive_14d','14-day re-engagement','educational',ARRAY['email','in_app'],'Your Xellvio workspace is ready whenever you are','Your Xellvio workspace is ready whenever you are','Reach your customers by SMS, automate follow-ups and grow with Xellvio.','Return to Xellvio','/app',20160),
('low_credits','Low credit alert','transactional',ARRAY['in_app','email'],'Your Xellvio balance is running low','Your balance is running low','Top up so your campaigns keep sending without interruption.','Top up','/app/billing',0),
('plan_usage_warning','Plan usage warning','transactional',ARRAY['in_app'],NULL,'You''re getting close to your plan limit','Review your usage and pick the plan that fits your sending.','View Plans','/pricing',0),
('feature_discovery_automation','Feature discovery — automations','educational',ARRAY['in_app'],NULL,'Ready to save time?','Automate follow-ups and customer journeys with Xellvio Automations.','Explore Automations','/app/automations',0),
('feature_announcement','New feature announcement','product_update',ARRAY['in_app','email'],'Something new in Xellvio','Something new in Xellvio','We''ve shipped a new feature to help you grow.','Take a look','/app',0),
('upgrade_recommendation','Upgrade recommendation','promotional',ARRAY['in_app'],NULL,'Unlock more with Xellvio','Based on how much you''re sending, a larger credit pack gives you a better rate.','View Plans','/app/billing',0);
